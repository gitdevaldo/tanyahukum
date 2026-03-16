"""Analysis orchestrator: clause → embed → RAG → Claude Sonnet 4.6 → risk scores."""
import json
import uuid
import logging
import asyncio
import concurrent.futures
from openai import OpenAI

from api.config import settings
from api.models.schemas import (
    AnalysisResponse, ClauseAnalysis, RegulationRef, RiskLevel
)
from api.services.pdf_extractor import extract_text_from_pdf
from api.services.clause_splitter import split_into_clauses
from api.services.embeddings import embed_single, embed_texts
from api.services.rag import vector_search, build_retrieval_context
from api.services.llm import get_llm_client
from api.services.guardrails import (
    validate_pdf_upload, validate_extracted_text, ground_citations, LEGAL_DISCLAIMER_ID
)

logger = logging.getLogger(__name__)


ANALYSIS_SYSTEM_PROMPT = """Kamu adalah TanyaHukum, AI ahli analisis kontrak hukum Indonesia.

TUGAS: Analisis klausa kontrak berikut dan berikan penilaian risiko.

Untuk setiap klausa, kamu HARUS menghasilkan output JSON dengan format:
{
  "risk_level": "high" | "medium" | "low" | "safe",
  "risk_score": <angka 0-10, dimana 10 = sangat berisiko>,
  "summary": "<penjelasan singkat risiko dalam Bahasa Indonesia>",
  "issues": ["<masalah 1>", "<masalah 2>"],
  "recommendations": ["<rekomendasi 1>", "<rekomendasi 2>"],
  "regulation_refs": [
    {"source": "<nama regulasi>", "pasal_ref": "<pasal spesifik>", "relevance": "<kenapa relevan>"}
  ]
}

PANDUAN PENILAIAN:
- SAFE (0-2): Klausa standar, tidak ada risiko signifikan
- LOW (3-4): Risiko minor, perlu perhatian tapi tidak mendesak
- MEDIUM (5-7): Risiko signifikan, perlu review pengacara
- HIGH (8-10): Risiko serius, potensi pelanggaran hukum atau kerugian besar

ATURAN:
1. Fokus pada hukum Indonesia (KUHPerdata, UU Ketenagakerjaan, UU Perlindungan Konsumen, dll)
2. Gunakan regulasi dari konteks RAG yang diberikan sebagai referensi utama
3. JANGAN mengarang pasal/regulasi yang tidak ada di konteks
4. Jika tidak ada regulasi yang relevan dari konteks, katakan "tidak ditemukan regulasi terkait dalam database"
5. Jawab selalu dalam Bahasa Indonesia
6. Jika ada konflik aturan, terapkan urutan: lex superior, lalu lex specialis, lalu lex posterior.
7. Untuk aturan sektoral instansi (mis. POJK/SE OJK/BI), perlakukan sebagai aturan khusus nasional di sektor terkait, namun tetap cek konsistensi dengan UU/PP/Perpres.
8. Untuk aturan daerah (Perda/Perkada), jangan gunakan lintas wilayah jika konteks wilayah dokumen berbeda.
"""


def _analyze_clause_with_llm(
    clause_text: str,
    rag_context: list[dict],
    clause_index: int,
) -> ClauseAnalysis:
    """Send a single clause + RAG context to Claude for risk analysis."""
    client = get_llm_client()

    # Build RAG context string
    rag_text = ""
    if rag_context:
        rag_text = "\n\nREGULASI TERKAIT DARI DATABASE:\n"
        for i, chunk in enumerate(rag_context, 1):
            source = chunk.get("source", "Unknown")
            pasal = chunk.get("pasal_ref", "")
            content = chunk.get("content", "")[:500]
            score = chunk.get("score", 0)
            bentuk = chunk.get("bentuk", "")
            tahun = chunk.get("tahun", "")
            lokasi = chunk.get("lokasi", "")
            tier_label = chunk.get("tier_label", "")
            rag_text += f"\n[{i}] {source}"
            if pasal:
                rag_text += f" - {pasal}"
            if bentuk or tahun:
                rag_text += f" [{bentuk} {tahun}]".strip()
            if lokasi:
                rag_text += f" | lokasi/instansi: {lokasi}"
            if tier_label:
                rag_text += f" | tier: {tier_label}"
            rag_text += f" (relevansi: {score:.2f})\n{content}\n"

    user_prompt = f"""Analisis klausa kontrak berikut:

KLAUSA #{clause_index}:
{clause_text}
{rag_text}

Berikan analisis dalam format JSON sesuai instruksi. HANYA output JSON, tanpa teks tambahan."""

    response = client.chat.completions.create(
        model=settings.do_model,
        messages=[
            {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        max_tokens=3000,
    )

    raw = response.choices[0].message.content.strip()

    # Parse JSON from response (handle markdown code blocks)
    json_str = raw
    if "```json" in json_str:
        json_str = json_str.split("```json")[1].split("```")[0].strip()
    elif "```" in json_str:
        json_str = json_str.split("```")[1].split("```")[0].strip()

    # Try to repair truncated JSON by closing open braces/brackets
    def try_repair_json(s: str) -> dict | None:
        """Attempt to parse JSON, repairing truncation if needed."""
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            pass
        # Try truncating at last complete key-value and closing
        for end_char in ['}', '"]', '"}']:
            last = s.rfind(end_char)
            if last > 0:
                candidate = s[:last + len(end_char)]
                # Count open/close braces and brackets, then close them
                opens = candidate.count('{') - candidate.count('}')
                open_brackets = candidate.count('[') - candidate.count(']')
                candidate += ']' * open_brackets + '}' * opens
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    continue
        return None

    result = try_repair_json(json_str)
    if result is None:
        logger.warning(f"Failed to parse LLM JSON for clause {clause_index}")
        logger.warning(f"Raw LLM response (first 300): {raw[:300]}")
        result = {
            "risk_level": "medium",
            "risk_score": 5,
            "summary": "Tidak dapat menganalisis klausa ini secara otomatis. Silakan review manual.",
            "issues": [],
            "recommendations": ["Review manual oleh pengacara disarankan"],
            "regulation_refs": [],
        }

    # Map regulation refs
    matched_regs = []
    for ref in result.get("regulation_refs", []):
        matched_regs.append(RegulationRef(
            source=ref.get("source", ""),
            pasal_ref=ref.get("pasal_ref", ""),
            content_snippet=ref.get("relevance", ""),
            similarity_score=0.0,
        ))

    # Also add RAG results as matched regulations
    for chunk in rag_context:
        matched_regs.append(RegulationRef(
            source=chunk.get("source", ""),
            pasal_ref=chunk.get("pasal_ref", ""),
            content_snippet=chunk.get("content", "")[:200],
            similarity_score=chunk.get("score", 0),
        ))

    # Deduplicate by source+pasal
    seen = set()
    unique_regs = []
    for reg in matched_regs:
        key = f"{reg.source}|{reg.pasal_ref}"
        if key not in seen:
            seen.add(key)
            unique_regs.append(reg)

    risk_level_str = result.get("risk_level", "medium").lower()
    try:
        risk_level = RiskLevel(risk_level_str)
    except ValueError:
        risk_level = RiskLevel.MEDIUM

    return ClauseAnalysis(
        clause_index=clause_index,
        clause_text=clause_text[:1000],  # Truncate for response
        risk_level=risk_level,
        risk_score=min(10, max(0, float(result.get("risk_score", 5)))),
        summary=result.get("summary", ""),
        issues=result.get("issues", []),
        recommendations=result.get("recommendations", []),
        matched_regulations=unique_regs,
    )


async def analyze_contract(pdf_bytes: bytes, filename: str) -> AnalysisResponse:
    """Full analysis pipeline — runs sync work in a thread to avoid blocking event loop."""
    return await asyncio.to_thread(_analyze_contract_sync, pdf_bytes, filename)


def _analyze_contract_sync(pdf_bytes: bytes, filename: str) -> AnalysisResponse:
    """Full analysis pipeline: PDF → text → clauses → RAG → LLM → result."""
    # 1. Validate PDF
    valid, error = validate_pdf_upload(pdf_bytes, filename)
    if not valid:
        raise ValueError(error)

    # 2. Extract text
    text = extract_text_from_pdf(pdf_bytes)
    valid, error = validate_extracted_text(text)
    if not valid:
        raise ValueError(error)

    # 3. Split into clauses
    clauses = split_into_clauses(text)
    if not clauses:
        raise ValueError("Tidak dapat mengidentifikasi klausa dalam dokumen.")

    # Limit clauses
    if len(clauses) > settings.max_clauses:
        clauses = clauses[:settings.max_clauses]

    logger.info(f"Analyzing {len(clauses)} clauses from {filename}")

    # 4. Batch embed all clauses at once (1 API call instead of N)
    clause_texts = [c["text"][:2000] for c in clauses]
    logger.info(f"Batch embedding {len(clause_texts)} clauses")
    embeddings = embed_texts(clause_texts)
    retrieval_context = build_retrieval_context(text, filename=filename)

    # 5. Parallel RAG + LLM for each clause
    clause_results: list[ClauseAnalysis] = [None] * len(clauses)

    def process_clause(idx_clause):
        idx, clause = idx_clause
        try:
            rag_results = vector_search(
                embeddings[idx],
                top_k=settings.rag_top_k,
                clause_text=clause["text"],
                retrieval_context=retrieval_context,
            )
            analysis = _analyze_clause_with_llm(
                clause["text"],
                rag_results,
                clause["index"],
            )
            analysis = ground_citations(analysis, rag_results)
            return idx, analysis
        except Exception as e:
            logger.error(f"Error analyzing clause {clause['index']}: {e}")
            return idx, ClauseAnalysis(
                clause_index=clause["index"],
                clause_text=clause["text"][:1000],
                risk_level=RiskLevel.MEDIUM,
                risk_score=5,
                summary=f"Gagal menganalisis: {str(e)[:200]}",
                issues=["Analisis otomatis gagal"],
                recommendations=["Review manual diperlukan"],
                matched_regulations=[],
            )

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(clauses), 9)) as executor:
        futures = executor.map(process_clause, enumerate(clauses))
        for idx, result in futures:
            clause_results[idx] = result

    # 5. Aggregate results
    high = sum(1 for c in clause_results if c.risk_level == RiskLevel.HIGH)
    medium = sum(1 for c in clause_results if c.risk_level == RiskLevel.MEDIUM)
    low = sum(1 for c in clause_results if c.risk_level == RiskLevel.LOW)
    safe = sum(1 for c in clause_results if c.risk_level == RiskLevel.SAFE)

    # Overall risk: highest risk found
    if high > 0:
        overall_risk = RiskLevel.HIGH
    elif medium > 0:
        overall_risk = RiskLevel.MEDIUM
    elif low > 0:
        overall_risk = RiskLevel.LOW
    else:
        overall_risk = RiskLevel.SAFE

    # Overall score: weighted average
    if clause_results:
        overall_score = sum(c.risk_score for c in clause_results) / len(clause_results)
    else:
        overall_score = 0

    # Generate summary with LLM
    summary = _generate_summary(clause_results, filename)

    return AnalysisResponse(
        analysis_id=str(uuid.uuid4()),
        filename=filename,
        overall_risk=overall_risk,
        overall_score=round(overall_score, 1),
        total_clauses=len(clause_results),
        high_risk_count=high,
        medium_risk_count=medium,
        low_risk_count=low,
        safe_count=safe,
        summary=summary,
        clauses=clause_results,
        disclaimer=LEGAL_DISCLAIMER_ID,
    )


def _generate_summary(clauses: list[ClauseAnalysis], filename: str) -> str:
    """Generate an overall summary using LLM — short, structured, Indonesian."""
    client = get_llm_client()

    clause_overview = []
    for c in clauses:
        clause_overview.append(
            f"- Klausa #{c.clause_index}: {c.risk_level.value} (skor {c.risk_score}) — {c.summary[:80]}"
        )

    prompt = f"""Analisis kontrak "{filename}" dengan {len(clauses)} klausa:

{chr(10).join(clause_overview)}

Buatkan ringkasan analisis dalam Bahasa Indonesia dengan format:
1. Paragraf pertama: gambaran umum dokumen dan tingkat risiko keseluruhan (2-3 kalimat)
2. Paragraf kedua: temuan utama yang perlu diperhatikan (2-3 kalimat)
3. Paragraf ketiga: rekomendasi singkat (1 kalimat)

PENTING: Tulis dalam paragraf biasa, JANGAN gunakan markdown, bullet point, atau format list. Pisahkan paragraf dengan baris kosong."""

    response = client.chat.completions.create(
        model=settings.do_model,
        messages=[
            {"role": "system", "content": "Kamu adalah asisten ringkasan analisis hukum. Jawab singkat, jelas, dan terstruktur dalam Bahasa Indonesia. Jangan gunakan markdown formatting."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=600,
    )

    return response.choices[0].message.content.strip()
