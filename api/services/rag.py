"""Qdrant vector search for RAG retrieval with legal hierarchy-aware reranking."""
import logging
import re
from typing import Any

from qdrant_client import QdrantClient

from api.config import settings

logger = logging.getLogger(__name__)

_client: QdrantClient | None = None

COLLECTION = "legal_chunks"
MAX_TOP_K = 20
MAX_CANDIDATES = 200
DEFAULT_CANDIDATE_FACTOR = 12

PROVINCES = (
    "aceh", "sumatera utara", "sumatera barat", "riau", "kepulauan riau", "jambi",
    "sumatera selatan", "kepulauan bangka belitung", "bengkulu", "lampung",
    "dki jakarta", "jakarta", "jawa barat", "jawa tengah", "di yogyakarta",
    "yogyakarta", "jawa timur", "banten", "bali", "nusa tenggara barat",
    "nusa tenggara timur", "kalimantan barat", "kalimantan tengah",
    "kalimantan selatan", "kalimantan timur", "kalimantan utara",
    "sulawesi utara", "gorontalo", "sulawesi tengah", "sulawesi barat",
    "sulawesi selatan", "sulawesi tenggara", "maluku", "maluku utara",
    "papua", "papua barat", "papua barat daya", "papua selatan",
    "papua tengah", "papua pegunungan",
)

INSTITUTION_ALIASES = {
    "ojk": ("otoritas jasa keuangan", "pojk", "seojk", "se ojk"),
    "bank_indonesia": ("bank indonesia", "peraturan bank indonesia", "pbi", "sebi"),
    "bappebti": ("bappebti", "badan pengawas perdagangan berjangka komoditi"),
    "kementerian_keuangan": ("kementerian keuangan", "kemenkeu", "menteri keuangan", "pmk"),
    "kementerian_kominfo": (
        "kementerian komunikasi dan informatika",
        "kementerian kominfo",
        "kominfo",
        "menteri komunikasi dan informatika",
    ),
}

FINANCE_KEYWORDS = (
    "jasa keuangan", "fintech", "pinjaman online", "p2p", "bank", "perbankan",
    "asuransi", "pasar modal", "lembaga pembiayaan", "investasi", "bursa efek",
    "sekuritas", "kredit", "debitur", "konsumen jasa keuangan",
)

FINANCE_INSTITUTIONS = {"ojk", "bank_indonesia", "bappebti", "kementerian_keuangan"}
NATIONAL_INSTITUTIONS = FINANCE_INSTITUTIONS | {"kementerian_kominfo"}


def _norm(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    match = re.search(r"\b(19\d{2}|20\d{2})\b", str(value))
    if not match:
        return None
    year = int(match.group(1))
    if 1900 <= year <= 2100:
        return year
    return None


def _extract_institutions(text: str) -> set[str]:
    found: set[str] = set()
    for name, aliases in INSTITUTION_ALIASES.items():
        if any(alias in text for alias in aliases):
            found.add(name)
    return found


def build_retrieval_context(document_text: str, filename: str = "") -> dict[str, Any]:
    """Extract retrieval context hints from document text + filename."""
    scope = _norm(f"{filename}\n{document_text}")[:24000]
    institutions = _extract_institutions(scope)
    regions = {prov for prov in PROVINCES if prov in scope}
    finance_context = any(k in scope for k in FINANCE_KEYWORDS) or bool(institutions & FINANCE_INSTITUTIONS)
    return {
        "institutions": institutions,
        "regions": regions,
        "finance_context": finance_context,
    }


def _merge_context(
    base_context: dict[str, Any] | None = None,
    clause_text: str | None = None,
) -> dict[str, Any]:
    context = {"institutions": set(), "regions": set(), "finance_context": False}

    if isinstance(base_context, dict):
        context["institutions"].update(base_context.get("institutions", set()) or set())
        context["regions"].update(base_context.get("regions", set()) or set())
        context["finance_context"] = bool(base_context.get("finance_context", False))

    if clause_text:
        clause_context = build_retrieval_context(clause_text)
        context["institutions"].update(clause_context["institutions"])
        context["regions"].update(clause_context["regions"])
        context["finance_context"] = context["finance_context"] or clause_context["finance_context"]

    return context


def _payload_text(payload: dict[str, Any]) -> str:
    return _norm(
        " ".join(
            [
                str(payload.get("bentuk", "")),
                str(payload.get("bentuk_singkat", "")),
                str(payload.get("source", "")),
                str(payload.get("judul", "")),
                str(payload.get("title", "")),
                str(payload.get("lokasi", "")),
                str(payload.get("teu", "")),
                str(payload.get("subjek", "")),
                str(payload.get("tema_name", "")),
            ]
        )
    )


def _classify_tier(payload: dict[str, Any]) -> tuple[int, str]:
    text = _payload_text(payload)

    if "undang-undang dasar" in text or re.search(r"\buud(?:\s*1945)?\b", text):
        return 1, "UUD 1945"
    if "ketetapan mpr" in text or "tap mpr" in text:
        return 2, "Ketetapan MPR"
    if "perppu" in text or "undang-undang" in text or re.search(r"\buu\b", text):
        return 3, "UU/Perppu"
    if "peraturan pemerintah" in text or re.search(r"\bpp\b", text):
        return 4, "Peraturan Pemerintah"
    if "peraturan presiden" in text or "perpres" in text:
        return 5, "Peraturan Presiden"
    if any(
        kw in text
        for kw in (
            "peraturan otoritas jasa keuangan",
            "surat edaran otoritas jasa keuangan",
            "pojk",
            "seojk",
            "peraturan menteri",
            "peraturan bank indonesia",
            "surat edaran bank indonesia",
            "pbi",
            "sebi",
            "peraturan bappebti",
        )
    ):
        return 6, "Peraturan Instansi/Permen-level"
    if "peraturan daerah provinsi" in text or "perda provinsi" in text:
        return 7, "Perda Provinsi"
    if any(
        kw in text
        for kw in (
            "peraturan daerah kabupaten",
            "peraturan daerah kota",
            "perda kabupaten",
            "perda kota",
            "peraturan bupati",
            "peraturan wali kota",
            "peraturan walikota",
            "peraturan gubernur",
        )
    ):
        return 8, "Perda/Perkada"
    return 9, "Lainnya"


def _authority_bonus(tier_rank: int) -> float:
    # Higher norm gets a moderate boost (lex superior), but semantic score remains dominant.
    table = {
        1: 0.24,
        2: 0.21,
        3: 0.18,
        4: 0.15,
        5: 0.12,
        6: 0.09,
        7: 0.05,
        8: 0.03,
        9: 0.0,
    }
    return table.get(tier_rank, 0.0)


def _recency_bonus(year: int | None) -> float:
    if year is None:
        return 0.0
    # Small tie-breaker for newer regulations (lex posterior), capped to stay safe.
    return max(0.0, min((year - 2000) / 30.0, 1.0)) * 0.03


def _extract_candidate_institutions(payload: dict[str, Any]) -> set[str]:
    text = _payload_text(payload)
    return _extract_institutions(text)


def _is_local_regulation(payload: dict[str, Any], tier_rank: int) -> bool:
    if tier_rank >= 7:
        return True
    text = _payload_text(payload)
    return any(
        kw in text
        for kw in (
            "peraturan daerah",
            "perda",
            "peraturan gubernur",
            "peraturan bupati",
            "peraturan wali kota",
            "peraturan walikota",
        )
    )


def _is_national_regulation(
    payload: dict[str, Any],
    tier_rank: int,
    candidate_institutions: set[str],
) -> bool:
    if tier_rank <= 5:
        return True
    if candidate_institutions & NATIONAL_INSTITUTIONS:
        return True

    lokasi = _norm(payload.get("lokasi", ""))
    teu = _norm(payload.get("teu", ""))
    if "pemerintah pusat" in lokasi or "pemerintah pusat" in teu:
        return True
    return False


def _region_matches(payload: dict[str, Any], regions: set[str]) -> bool:
    if not regions:
        return False
    text = _norm(
        " ".join(
            [
                str(payload.get("lokasi", "")),
                str(payload.get("teu", "")),
                str(payload.get("source", "")),
                str(payload.get("judul", "")),
                str(payload.get("title", "")),
            ]
        )
    )
    return any(region in text for region in regions)


def _ensure_upper_tier_coverage(
    ranked: list[dict[str, Any]],
    top_k: int,
    required_upper: int,
) -> list[dict[str, Any]]:
    if not ranked:
        return []

    selected = ranked[:top_k]
    if required_upper <= 0:
        return selected

    upper_count = sum(1 for item in selected if int(item["tier_rank"]) <= 5)
    if upper_count >= required_upper:
        return selected

    upper_pool = [item for item in ranked[top_k:] if int(item["tier_rank"]) <= 5]
    for upper in upper_pool:
        if upper_count >= required_upper:
            break

        replace_idx = None
        lowest_score = float("inf")
        for idx, item in enumerate(selected):
            if int(item["tier_rank"]) <= 5:
                continue
            if item.get("hard_context_match"):
                continue
            score = float(item.get("adjusted_score", 0.0))
            if score < lowest_score:
                lowest_score = score
                replace_idx = idx

        if replace_idx is None:
            break

        selected[replace_idx] = upper
        upper_count += 1

    selected.sort(key=lambda x: float(x.get("adjusted_score", 0.0)), reverse=True)
    return selected


def get_qdrant() -> QdrantClient:
    """Lazy initialization of Qdrant client."""
    global _client
    if _client is None:
        _client = QdrantClient(url=settings.qdrant_url, timeout=30)
    return _client


def vector_search(
    query_embedding: list[float],
    top_k: int = 5,
    clause_text: str | None = None,
    retrieval_context: dict[str, Any] | None = None,
) -> list[dict]:
    """Search legal_chunks and rerank by hierarchy + jurisdiction + institution context."""
    top_k = max(1, min(top_k, MAX_TOP_K))
    candidate_limit = min(max(top_k * DEFAULT_CANDIDATE_FACTOR, top_k + 20), MAX_CANDIDATES)
    client = get_qdrant()
    context = _merge_context(retrieval_context, clause_text)

    results = client.query_points(
        collection_name=COLLECTION,
        query=query_embedding,
        limit=candidate_limit,
        with_payload=True,
    )

    ranked: list[dict[str, Any]] = []
    for hit in results.points:
        payload = dict(hit.payload or {})
        tier_rank, tier_label = _classify_tier(payload)
        year = _to_int(payload.get("tahun")) or _to_int(payload.get("title")) or _to_int(payload.get("source"))
        candidate_institutions = _extract_candidate_institutions(payload)

        semantic_score = float(hit.score or 0.0)
        adjusted_score = semantic_score + _authority_bonus(tier_rank) + _recency_bonus(year)

        region_match = _region_matches(payload, context["regions"])
        institution_match = bool(candidate_institutions & context["institutions"])
        local_regulation = _is_local_regulation(payload, tier_rank)
        national_regulation = _is_national_regulation(payload, tier_rank, candidate_institutions)

        # Institution-aware reranking (instansi context should not mix unrelated agencies).
        if context["institutions"]:
            if institution_match:
                adjusted_score += 0.28
            elif candidate_institutions:
                adjusted_score -= 0.14

        # Finance sector: boost sectoral national regulators (POJK/BI/Bappebti/etc).
        if context["finance_context"]:
            if candidate_institutions & FINANCE_INSTITUTIONS:
                adjusted_score += 0.20
            elif local_regulation and not region_match:
                adjusted_score -= 0.08

        # Territorial relevance: strict for local regs, but keep national and sectoral rules.
        if context["regions"]:
            if region_match:
                adjusted_score += 0.30
            elif local_regulation and not national_regulation:
                adjusted_score -= 0.36
            elif national_regulation:
                adjusted_score += 0.06

        ranked.append(
            {
                "content": payload.get("content", ""),
                "source": payload.get("source", payload.get("judul", payload.get("title", ""))),
                "pasal_ref": payload.get("pasal_ref", ""),
                "doc_id": payload.get("doc_id", ""),
                "lokasi": payload.get("lokasi", ""),
                "bentuk": payload.get("bentuk", ""),
                "bentuk_singkat": payload.get("bentuk_singkat", ""),
                "tahun": payload.get("tahun", ""),
                "tema_name": payload.get("tema_name", ""),
                "score": adjusted_score,
                "semantic_score": semantic_score,
                "tier_rank": tier_rank,
                "tier_label": tier_label,
                "hard_context_match": institution_match or region_match,
                "adjusted_score": adjusted_score,
            }
        )

    ranked.sort(key=lambda x: float(x.get("adjusted_score", 0.0)), reverse=True)

    # For sectoral/instansi contexts, ensure at least 2 higher-tier controls are present.
    required_upper = 2 if (context["finance_context"] or bool(context["institutions"])) else 1
    selected = _ensure_upper_tier_coverage(ranked, top_k=top_k, required_upper=required_upper)

    return [
        {
            "content": item["content"],
            "source": item["source"],
            "pasal_ref": item["pasal_ref"],
            "doc_id": item["doc_id"],
            "lokasi": item["lokasi"],
            "bentuk": item["bentuk"],
            "bentuk_singkat": item["bentuk_singkat"],
            "tahun": item["tahun"],
            "tema_name": item["tema_name"],
            "score": item["score"],
            "semantic_score": item["semantic_score"],
            "tier_rank": item["tier_rank"],
            "tier_label": item["tier_label"],
        }
        for item in selected
    ]


def get_chunks_count() -> int:
    """Get total number of chunks in the collection."""
    client = get_qdrant()
    info = client.get_collection(COLLECTION)
    return info.points_count or 0


def check_connection() -> bool:
    """Check if Qdrant is reachable."""
    try:
        client = get_qdrant()
        client.get_collections()
        return True
    except Exception:
        return False
