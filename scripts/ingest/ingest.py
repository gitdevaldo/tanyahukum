"""
TanyaHukum — Ingestion Pipeline
=================================
Parses regulation PDFs → chunks by pasal → embeds with Mistral → stores in Qdrant.

USAGE:
  python3 scripts/ingest/ingest.py             # full ingestion
  python3 scripts/ingest/ingest.py --stats     # show ingestion stats
  python3 scripts/ingest/ingest.py --retry-errors # retry previously failed PDFs
  python3 scripts/ingest/ingest.py --parse-only   # parse + chunk only (no embedding)
  python3 scripts/ingest/ingest.py --backfill-metadata  # patch existing Qdrant payloads

REQUIREMENTS:
  pip install pymupdf qdrant-client python-dotenv requests rich aiohttp
"""

import os
import re
import json
import time
import asyncio
import threading
import argparse
import requests
import aiohttp
import fitz  # PyMuPDF
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

try:
    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeElapsedColumn
    console = Console()
except ImportError:
    print("ERROR: pip install rich")
    exit(1)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

# ── Config ────────────────────────────────────────────────────────
DATA_DIR        = PROJECT_ROOT / "data"
REGULATIONS_DIR = DATA_DIR / "regulations"
META_F          = DATA_DIR / "regulations_meta.json"
INGEST_STATE_F  = DATA_DIR / "ingest_state.json"

QDRANT_URL      = os.getenv("QDRANT_URL", "http://localhost:6333")
LEGAL_COLLECTION = "legal_chunks"
MISTRAL_API_KEY_URL = "https://n8n.aldo.codes/webhook/68c51f35-0fef-4bc0-a909-f60484c8c532"

MISTRAL_EMBED_URL   = "https://api.mistral.ai/v1/embeddings"
MISTRAL_MODEL       = "mistral-embed"
MISTRAL_MAX_TOKENS  = 16_000  # max tokens per batch
MISTRAL_RPS         = 5       # stay under 6 rps limit

CHUNK_MIN_TOKENS    = 50      # skip chunks smaller than this
CHUNK_MAX_TOKENS    = 800     # split chunks larger than this


# ================================================================
# STATE TRACKING
# ================================================================

def load_ingest_state() -> dict:
    if INGEST_STATE_F.exists():
        try:
            with open(INGEST_STATE_F) as f:
                state = json.load(f)
            return normalize_ingest_state(state)
        except Exception as e:
            console.print(f"  [yellow]State file invalid, rebuilding default state: {str(e)[:80]}[/yellow]")
            return default_ingest_state()
    return default_ingest_state()


def default_ingest_state() -> dict:
    return {
        "parsed":    {},  # doc_id -> {"status": "success"|"error"|"empty", "chunks": int, "error": str|null}
        "embedded":  [],  # list of doc_ids fully embedded
        "embed_errors": {},  # doc_id -> {"error": str, "attempts": int}
        "stats": {
            "total_pdfs": 0,
            "parsed_success": 0,
            "parsed_error": 0,
            "parsed_empty": 0,
            "total_chunks": 0,
            "total_embedded": 0,
            "embed_errors": 0,
        },
        "last_updated": None,
    }


def normalize_ingest_state(state: dict) -> dict:
    """Ensure ingest state has all required keys (for backward/partial states)."""
    defaults = default_ingest_state()
    if not isinstance(state, dict):
        return defaults

    state.setdefault("parsed", {})
    state.setdefault("embedded", [])
    state.setdefault("embed_errors", {})
    state.setdefault("stats", {})
    state.setdefault("last_updated", None)

    if not isinstance(state["parsed"], dict):
        state["parsed"] = {}
    if not isinstance(state["embedded"], list):
        state["embedded"] = []
    if not isinstance(state["embed_errors"], dict):
        state["embed_errors"] = {}
    if not isinstance(state["stats"], dict):
        state["stats"] = {}

    for key, value in defaults["stats"].items():
        state["stats"].setdefault(key, value)

    return state


def save_ingest_state(state: dict):
    state = normalize_ingest_state(state)
    state["last_updated"] = datetime.now().isoformat()
    INGEST_STATE_F.parent.mkdir(parents=True, exist_ok=True)
    # M-24: Atomic write
    tmp = INGEST_STATE_F.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    tmp.rename(INGEST_STATE_F)

def load_meta() -> dict:
    if META_F.exists():
        with open(META_F) as f:
            data = json.load(f)
            return {r["id"]: r for r in data if r.get("id")}
    return {}


# ================================================================
# MISTRAL API KEY POOL (multi-key for parallel embedding)
# ================================================================

NUM_API_KEYS        = 10       # number of keys to fetch from webhook
CONCURRENCY_PER_KEY = 5        # concurrent requests per key
TOTAL_CONCURRENCY   = NUM_API_KEYS * CONCURRENCY_PER_KEY  # 50 total

_mistral_key = os.getenv("MISTRAL_API_KEY", "")
_key_pool: list[str] = []

def get_mistral_key() -> str:
    global _mistral_key
    return _mistral_key

def refresh_mistral_key() -> str:
    global _mistral_key
    try:
        r = requests.get(MISTRAL_API_KEY_URL, timeout=10)
        r.raise_for_status()
        _mistral_key = r.json().get("apikey", _mistral_key)
        console.print(f"  🔑 Refreshed Mistral API key")
    except Exception as e:
        console.print(f"  [red]Failed to refresh key: {e}[/red]")
    return _mistral_key

def fetch_key_pool(n: int = NUM_API_KEYS) -> list[str]:
    """Fetch N unique API keys from the webhook."""
    global _key_pool
    keys: list[str] = []
    seen: set[str] = set()
    max_attempts = n * 3  # some buffer for duplicates
    attempts = 0

    console.print(f"  🔑 Fetching {n} API keys from webhook...")
    while len(keys) < n and attempts < max_attempts:
        attempts += 1
        try:
            r = requests.get(f"{MISTRAL_API_KEY_URL}?v={attempts}", timeout=10)
            r.raise_for_status()
            key = r.json().get("apikey", "")
            if key and key not in seen:
                keys.append(key)
                seen.add(key)
        except Exception as e:
            console.print(f"  [yellow]Key fetch attempt {attempts} failed: {str(e)[:60]}[/yellow]")
            time.sleep(0.5)

    _key_pool = keys
    console.print(f"  ✅ Got {len(keys)} unique API keys")
    return keys


# ================================================================
# STEP 1: PARSE PDFs
# ================================================================

def extract_text(pdf_path: Path) -> str:
    """Extract text from a PDF using PyMuPDF."""
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n".join(pages)


# ================================================================
# STEP 2: CHUNK BY PASAL
# ================================================================

# Pattern matches: Pasal 1, Pasal 18, BAB I, BAB XII, etc.
PASAL_PATTERN = re.compile(
    r'^(?:'
    r'(?:Pasal|PASAL)\s+\d+'          # Pasal 1, PASAL 18
    r'|(?:BAB|Bab)\s+[IVXLCDM\d]+'   # BAB I, BAB XII, Bab 3
    r'|(?:Bagian|BAGIAN)\s+\w+'       # Bagian Kesatu
    r'|(?:Paragraf|PARAGRAF)\s+\d+'   # Paragraf 1
    r')',
    re.MULTILINE
)

def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~1 token per 4 chars for Indonesian."""
    return len(text) // 4

def chunk_by_pasal(text: str, doc_id: str, meta: dict) -> list[dict]:
    """Split regulation text into chunks at pasal/bab boundaries."""
    if not text or not text.strip():
        return []

    # Find all pasal/bab boundaries
    splits = list(PASAL_PATTERN.finditer(text))

    chunks = []
    source_name = meta.get("judul", meta.get("title", f"Doc {doc_id}"))
    bentuk = meta.get("bentuk_singkat", meta.get("bentuk", ""))
    nomor = meta.get("nomor", "")
    tahun = meta.get("tahun", "")
    subjek = meta.get("subjek", "")
    lokasi = meta.get("lokasi", "")

    if not splits:
        # No pasal structure found — chunk by fixed size
        return chunk_by_size(text, doc_id, meta)

    # Add preamble (text before first pasal) as a chunk
    preamble = text[:splits[0].start()].strip()
    if preamble and estimate_tokens(preamble) >= CHUNK_MIN_TOKENS:
        chunks.append({
            "doc_id":     doc_id,
            "pasal_ref":  "Pembukaan",
            "content":    preamble,
            "source":     source_name,
            "bentuk":     bentuk,
            "nomor":      nomor,
            "tahun":      tahun,
            "subjek":     subjek,
            "lokasi":     lokasi,
            "chunk_type": "preamble",
        })

    # Split at each boundary
    for i, match in enumerate(splits):
        start = match.start()
        end = splits[i + 1].start() if i + 1 < len(splits) else len(text)
        segment = text[start:end].strip()

        if not segment or estimate_tokens(segment) < CHUNK_MIN_TOKENS:
            continue

        # Extract pasal reference from the match
        pasal_ref = match.group(0).strip()

        # If chunk is too big, split further
        if estimate_tokens(segment) > CHUNK_MAX_TOKENS:
            sub_chunks = split_large_chunk(segment, pasal_ref)
            for j, sub in enumerate(sub_chunks):
                chunks.append({
                    "doc_id":     doc_id,
                    "pasal_ref":  f"{pasal_ref} (bagian {j+1})",
                    "content":    sub,
                    "source":     source_name,
                    "bentuk":     bentuk,
                    "nomor":      nomor,
                    "tahun":      tahun,
                    "subjek":     subjek,
                    "lokasi":     lokasi,
                    "chunk_type": "pasal_part",
                })
        else:
            chunks.append({
                "doc_id":     doc_id,
                "pasal_ref":  pasal_ref,
                "content":    segment,
                "source":     source_name,
                "bentuk":     bentuk,
                "nomor":      nomor,
                "tahun":      tahun,
                "subjek":     subjek,
                "lokasi":     lokasi,
                "chunk_type": "pasal",
            })

    return chunks


def split_large_chunk(text: str, pasal_ref: str) -> list[str]:
    """Split a large chunk into smaller pieces at ayat/paragraph boundaries."""
    # Try splitting at ayat boundaries: (1), (2), etc.
    ayat_pattern = re.compile(r'\n\s*\(\d+\)\s')
    parts = ayat_pattern.split(text)

    if len(parts) <= 1:
        # No ayat found — split by newlines into ~CHUNK_MAX_TOKENS groups
        lines = text.split('\n')
        result = []
        current = []
        current_tokens = 0
        for line in lines:
            lt = estimate_tokens(line)
            if current_tokens + lt > CHUNK_MAX_TOKENS and current:
                result.append('\n'.join(current))
                current = [line]
                current_tokens = lt
            else:
                current.append(line)
                current_tokens += lt
        if current:
            result.append('\n'.join(current))
        return [r for r in result if estimate_tokens(r) >= CHUNK_MIN_TOKENS]

    # Merge small ayat groups together
    result = []
    current = parts[0]
    for part in parts[1:]:
        if estimate_tokens(current) + estimate_tokens(part) < CHUNK_MAX_TOKENS:
            current += "\n" + part
        else:
            if estimate_tokens(current) >= CHUNK_MIN_TOKENS:
                result.append(current.strip())
            current = part
    if current.strip() and estimate_tokens(current) >= CHUNK_MIN_TOKENS:
        result.append(current.strip())

    return result


def chunk_by_size(text: str, doc_id: str, meta: dict) -> list[dict]:
    """Fallback: chunk by fixed token size when no pasal structure found."""
    source_name = meta.get("judul", meta.get("title", f"Doc {doc_id}"))
    bentuk = meta.get("bentuk_singkat", meta.get("bentuk", ""))
    nomor = meta.get("nomor", "")
    tahun = meta.get("tahun", "")
    subjek = meta.get("subjek", "")
    lokasi = meta.get("lokasi", "")

    paragraphs = text.split('\n\n')
    chunks = []
    current = ""
    chunk_idx = 0

    for para in paragraphs:
        if estimate_tokens(current) + estimate_tokens(para) > CHUNK_MAX_TOKENS and current:
            if estimate_tokens(current) >= CHUNK_MIN_TOKENS:
                chunk_idx += 1
                chunks.append({
                    "doc_id":     doc_id,
                    "pasal_ref":  f"Bagian {chunk_idx}",
                    "content":    current.strip(),
                    "source":     source_name,
                    "bentuk":     bentuk,
                    "nomor":      nomor,
                    "tahun":      tahun,
                    "subjek":     subjek,
                    "lokasi":     lokasi,
                    "chunk_type": "fixed_size",
                })
            current = para
        else:
            current = current + "\n\n" + para if current else para

    if current.strip() and estimate_tokens(current) >= CHUNK_MIN_TOKENS:
        chunk_idx += 1
        chunks.append({
            "doc_id":     doc_id,
            "pasal_ref":  f"Bagian {chunk_idx}",
            "content":    current.strip(),
            "source":     source_name,
            "bentuk":     bentuk,
            "nomor":      nomor,
            "tahun":      tahun,
            "subjek":     subjek,
            "lokasi":     lokasi,
            "chunk_type": "fixed_size",
        })

    return chunks


# ================================================================
# STEP 3: EMBED WITH MISTRAL
# ================================================================

def sanitize_text(text: str) -> str:
    """Clean text for Mistral API — remove null bytes, control chars, excessive whitespace."""
    # Remove null bytes and control characters (keep newlines/tabs)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    # Collapse excessive whitespace
    text = re.sub(r'\n{4,}', '\n\n\n', text)
    text = re.sub(r' {4,}', '   ', text)
    # Strip and ensure non-empty
    text = text.strip()
    return text if text else "empty"


async def _async_call_mistral(session: aiohttp.ClientSession, texts: list[str], key: str,
                              semaphore: asyncio.Semaphore) -> list[list[float]] | None:
    """Async Mistral embed call with semaphore-based concurrency control."""
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MISTRAL_MODEL,
        "input": texts,
    }

    async with semaphore:
        for attempt in range(3):
            try:
                async with session.post(MISTRAL_EMBED_URL, headers=headers,
                                        json=payload, timeout=aiohttp.ClientTimeout(total=30)) as r:
                    if r.status == 429:
                        wait = float(r.headers.get("retry-after", 2))
                        await asyncio.sleep(wait)
                        continue
                    if r.status in (401, 403):
                        await asyncio.sleep(1)
                        continue
                    if r.status == 400:
                        return None
                    r.raise_for_status()
                    data = await r.json()
                    return [d["embedding"] for d in data["data"]]
            except Exception:
                await asyncio.sleep(1)

    return None


async def _async_embed_batch_with_fallback(session: aiohttp.ClientSession, texts: list[str],
                                           key: str, semaphore: asyncio.Semaphore) -> list[list[float]] | None:
    """Try batch, fall back to single-item embed on 400."""
    texts = [sanitize_text(t) for t in texts]
    result = await _async_call_mistral(session, texts, key, semaphore)
    if result is not None:
        return result

    # Fallback: embed one-by-one
    zero_vec = [0.0] * 1024
    embeddings = []
    for text in texts:
        single = await _async_call_mistral(session, [text], key, semaphore)
        embeddings.append(single[0] if single else zero_vec)
    return embeddings


def _call_mistral_embed(texts: list[str], key: str) -> tuple[list[list[float]] | None, str]:
    """Sync fallback for single-key mode. Returns (embeddings, key)."""
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MISTRAL_MODEL,
        "input": texts,
    }

    for attempt in range(3):
        try:
            r = requests.post(MISTRAL_EMBED_URL, headers=headers, json=payload, timeout=30)

            if r.status_code in (401, 403):
                console.print("  [yellow]API key invalid, refreshing...[/yellow]")
                key = refresh_mistral_key()
                headers["Authorization"] = f"Bearer {key}"
                continue

            if r.status_code == 429:
                wait = float(r.headers.get("retry-after", 2))
                console.print(f"  [yellow]Rate limited, waiting {wait}s...[/yellow]")
                time.sleep(wait)
                continue

            if r.status_code == 400:
                return None, key

            r.raise_for_status()
            data = r.json()
            return [d["embedding"] for d in data["data"]], key

        except requests.exceptions.RequestException as e:
            console.print(f"  [red]Embed error (attempt {attempt+1}): {str(e)[:80]}[/red]")
            time.sleep(2)

    return None, key


def embed_batch(texts: list[str]) -> list[list[float]] | None:
    """Embed a batch of texts using Mistral API (sync, single key). Returns list of embeddings or None."""
    key = get_mistral_key()
    texts = [sanitize_text(t) for t in texts]

    result, key = _call_mistral_embed(texts, key)
    if result is not None:
        return result

    # Batch got 400 — fallback: embed one-by-one
    console.print(f"  [yellow]Batch 400 error, falling back to single-item embed ({len(texts)} items)...[/yellow]")
    zero_vec = [0.0] * 1024
    embeddings = []
    bad_count = 0
    for text in texts:
        single, key = _call_mistral_embed([text], key)
        if single is not None:
            embeddings.append(single[0])
        else:
            bad_count += 1
            embeddings.append(zero_vec)
        time.sleep(0.2)

    if bad_count:
        console.print(f"  [yellow]  {bad_count}/{len(texts)} chunks got zero vectors[/yellow]")
    return embeddings


def build_batches(chunks: list[dict]) -> list[list[int]]:
    """Group chunk indices into batches that fit under MISTRAL_MAX_TOKENS."""
    batches = []
    current_batch = []
    current_tokens = 0

    for i, chunk in enumerate(chunks):
        tokens = estimate_tokens(chunk["content"])
        if current_tokens + tokens > MISTRAL_MAX_TOKENS and current_batch:
            batches.append(current_batch)
            current_batch = [i]
            current_tokens = tokens
        else:
            current_batch.append(i)
            current_tokens += tokens

    if current_batch:
        batches.append(current_batch)

    return batches


# ================================================================
# STEP 4: STORE IN QDRANT
# ================================================================

def get_qdrant_client() -> QdrantClient:
    """Get Qdrant client for legal chunk storage."""
    return QdrantClient(url=QDRANT_URL, timeout=60)


def ensure_legal_collection(client: QdrantClient):
    """Ensure legal_chunks collection exists with expected vector config."""
    existing = {c.name for c in client.get_collections().collections}
    if LEGAL_COLLECTION not in existing:
        client.create_collection(
            collection_name=LEGAL_COLLECTION,
            vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
        )
        console.print(f"  ✅ Created Qdrant collection '{LEGAL_COLLECTION}'")


def get_next_point_id(client: QdrantClient) -> int:
    """Compute next integer point id based on current collection size."""
    info = client.get_collection(LEGAL_COLLECTION)
    return int(info.points_count or 0)


def _scan_existing_doc_ids(client: QdrantClient, batch_size: int = 1000) -> set[str]:
    """Scan Qdrant collection and return unique doc_id values already stored."""
    doc_ids: set[str] = set()
    offset = None

    while True:
        points, next_offset = client.scroll(
            collection_name=LEGAL_COLLECTION,
            limit=batch_size,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )
        if not points:
            break

        for point in points:
            payload = point.payload or {}
            doc_id = payload.get("doc_id")
            if doc_id is not None:
                text = str(doc_id).strip()
                if text:
                    doc_ids.add(text)

        if next_offset is None:
            break
        offset = next_offset

    return doc_ids


def recover_state_from_qdrant_if_needed(state: dict, meta: dict):
    """Recover missing parsed/embedded state from existing Qdrant payloads."""
    state = normalize_ingest_state(state)
    needs_parsed = len(state["parsed"]) == 0
    needs_embedded = len(state["embedded"]) == 0

    if not needs_parsed and not needs_embedded:
        return

    client = None
    try:
        client = get_qdrant_client()
        ensure_legal_collection(client)
        existing_doc_ids = _scan_existing_doc_ids(client)
    except Exception as e:
        console.print(f"  [yellow]State recovery skipped (Qdrant issue): {str(e)[:100]}[/yellow]")
        return
    finally:
        try:
            if client is not None:
                client.close()
        except Exception:
            pass

    if not existing_doc_ids:
        return

    recovered_embedded = 0
    recovered_parsed = 0

    if needs_embedded:
        state["embedded"] = sorted(existing_doc_ids)
        recovered_embedded = len(state["embedded"])

    if needs_parsed:
        for doc_id in existing_doc_ids:
            if doc_id in state["parsed"]:
                continue
            doc_meta = meta.get(doc_id, {})
            local_path = doc_meta.get("local_path", "") if isinstance(doc_meta, dict) else ""
            file_name = Path(local_path).name if local_path else f"{doc_id}.pdf"
            state["parsed"][doc_id] = {
                "status": "success",
                "chunks": 0,
                "chars": 0,
                "error": None,
                "file": file_name,
                "recovered_from_qdrant": True,
            }
            recovered_parsed += 1

    success_count = sum(1 for v in state["parsed"].values() if isinstance(v, dict) and v.get("status") == "success")
    state["stats"]["parsed_success"] = max(int(state["stats"].get("parsed_success", 0)), success_count)
    state["stats"]["embed_errors"] = len(state.get("embed_errors", {}))
    save_ingest_state(state)

    console.print(
        f"  🔁 Recovered ingest state from Qdrant: "
        f"embedded +{recovered_embedded}, parsed +{recovered_parsed}"
    )


# ================================================================
# MAIN PIPELINE
# ================================================================

def run_parse(state: dict, meta: dict, retry_errors: bool = False):
    """Step 1+2: Parse PDFs and chunk by pasal."""
    pdfs = sorted(REGULATIONS_DIR.glob("*.pdf"))
    state["stats"]["total_pdfs"] = len(pdfs)

    # Filter: skip already parsed (unless retrying errors)
    to_parse = []
    for pdf in pdfs:
        doc_id = pdf.name.split("_")[0]
        prev = state["parsed"].get(doc_id, {})
        if prev.get("status") == "success" and not retry_errors:
            continue
        if prev.get("status") == "error" and not retry_errors:
            continue
        if prev.get("status") == "error" and retry_errors:
            to_parse.append((pdf, doc_id))
            continue
        if not prev:
            to_parse.append((pdf, doc_id))

    console.print(f"\n[bold blue]Step 1+2: Parse & Chunk[/bold blue]")
    console.print(f"  Total PDFs: {len(pdfs)} | To parse: {len(to_parse)}")

    all_chunks = []

    with Progress(
        SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
        BarColumn(), TextColumn("{task.completed}/{task.total}"),
        TimeElapsedColumn(), console=console
    ) as progress:
        task = progress.add_task("Parsing PDFs", total=len(to_parse))

        for pdf_path, doc_id in to_parse:
            try:
                text = extract_text(pdf_path)

                if not text or len(text.strip()) < 100:
                    state["parsed"][doc_id] = {
                        "status": "empty",
                        "chunks": 0,
                        "error": "No text extracted (possibly scanned PDF)",
                        "file": pdf_path.name,
                    }
                    state["stats"]["parsed_empty"] += 1
                    progress.advance(task)
                    continue

                doc_meta = meta.get(doc_id, {"id": doc_id, "title": pdf_path.stem})
                chunks = chunk_by_pasal(text, doc_id, doc_meta)

                state["parsed"][doc_id] = {
                    "status": "success",
                    "chunks": len(chunks),
                    "chars": len(text),
                    "error": None,
                    "file": pdf_path.name,
                }
                state["stats"]["parsed_success"] += 1
                state["stats"]["total_chunks"] += len(chunks)
                all_chunks.extend(chunks)

            except Exception as e:
                state["parsed"][doc_id] = {
                    "status": "error",
                    "chunks": 0,
                    "error": str(e)[:200],
                    "file": pdf_path.name,
                }
                state["stats"]["parsed_error"] += 1

            progress.advance(task)

            # Save state every 100 PDFs
            if (progress.tasks[task].completed % 100) == 0:
                save_ingest_state(state)

    save_ingest_state(state)
    console.print(
        f"  ✅ Parsed: {state['stats']['parsed_success']} success | "
        f"❌ {state['stats']['parsed_error']} errors | "
        f"📭 {state['stats']['parsed_empty']} empty | "
        f"📦 {state['stats']['total_chunks']} chunks"
    )

    return all_chunks


def run_embed_and_store(chunks: list[dict], state: dict, meta_by_doc: dict):
    """Step 3+4: Embed chunks with Mistral (multi-key concurrent) and store in Qdrant."""
    if not chunks:
        console.print("[yellow]No chunks to embed.[/yellow]")
        return

    # Filter out chunks for already-embedded docs
    embedded_set = set(state["embedded"])
    to_embed = [c for c in chunks if c["doc_id"] not in embedded_set]

    if not to_embed:
        console.print("[yellow]All chunks already embedded.[/yellow]")
        return

    console.print(f"\n[bold blue]Step 3+4: Embed & Store (Multi-Key Concurrent)[/bold blue]")
    console.print(f"  Chunks to embed: {len(to_embed)}")

    # Build batches
    batches = build_batches(to_embed)
    console.print(f"  Batches: {len(batches)}")

    # Fetch key pool
    keys = fetch_key_pool(NUM_API_KEYS)
    if not keys:
        console.print("[red]No API keys available! Falling back to single key.[/red]")
        keys = [refresh_mistral_key()]

    console.print(f"  🚀 Running {len(keys)} keys × {CONCURRENCY_PER_KEY} conc = {len(keys) * CONCURRENCY_PER_KEY} parallel workers")

    try:
        client = get_qdrant_client()
        ensure_legal_collection(client)
        next_point_id = get_next_point_id(client)
    except Exception as e:
        console.print(f"  [red]Qdrant setup error: {str(e)[:120]}[/red]")
        return

    # Run async embedding
    doc_ids_in_run = set()
    failed_batches = 0
    inserted = 0
    state_lock = threading.Lock()
    point_id_lock = threading.Lock()
    base_total_embedded = int(state["stats"].get("total_embedded", 0))

    async def process_all():
        nonlocal failed_batches, inserted, doc_ids_in_run, next_point_id

        # Create per-key semaphores (5 concurrent per key)
        key_semaphores = {key: asyncio.Semaphore(CONCURRENCY_PER_KEY) for key in keys}

        async with aiohttp.ClientSession() as session:
            # Assign batches round-robin to keys
            tasks = []
            for i, batch_indices in enumerate(batches):
                key = keys[i % len(keys)]
                sem = key_semaphores[key]
                batch_chunks = [to_embed[idx] for idx in batch_indices]
                tasks.append((batch_chunks, key, sem))

            # Process with progress tracking
            completed = 0
            total = len(tasks)

            async def process_one(batch_chunks, key, sem):
                nonlocal completed, failed_batches, inserted, doc_ids_in_run, next_point_id
                texts = [c["content"] for c in batch_chunks]

                embeddings = await _async_embed_batch_with_fallback(session, texts, key, sem)

                if embeddings is None:
                    failed_doc_ids = set(c["doc_id"] for c in batch_chunks)
                    with state_lock:
                        for did in failed_doc_ids:
                            prev = state.get("embed_errors", {}).get(did, {"attempts": 0})
                            state.setdefault("embed_errors", {})[did] = {
                                "error": "Mistral returned None",
                                "attempts": prev["attempts"] + 1,
                            }
                    failed_batches += 1
                else:
                    points_to_upsert: list[PointStruct] = []
                    created_at = datetime.now().isoformat()
                    for chunk, embedding in zip(batch_chunks, embeddings):
                        with point_id_lock:
                            point_id = next_point_id
                            next_point_id += 1

                        payload = {
                            "doc_id":     chunk["doc_id"],
                            "pasal_ref":  chunk["pasal_ref"],
                            "content":    chunk["content"],
                            "source":     chunk["source"],
                            "bentuk":     chunk["bentuk"],
                            "nomor":      chunk["nomor"],
                            "tahun":      chunk["tahun"],
                            "subjek":     chunk["subjek"],
                            "lokasi":     chunk.get("lokasi", ""),
                            "chunk_type": chunk["chunk_type"],
                            "created_at": created_at,
                        }
                        # Append all metadata from details page.
                        doc_meta = meta_by_doc.get(chunk["doc_id"], {}) or {}
                        if isinstance(doc_meta, dict):
                            payload.update(doc_meta)

                        # Enforce chunk-specific canonical keys.
                        payload["doc_id"] = chunk["doc_id"]
                        payload["pasal_ref"] = chunk["pasal_ref"]
                        payload["content"] = chunk["content"]
                        payload["source"] = chunk["source"]
                        payload["chunk_type"] = chunk["chunk_type"]
                        payload["created_at"] = created_at
                        points_to_upsert.append(
                            PointStruct(
                                id=point_id,
                                vector=embedding,
                                payload=payload,
                            )
                        )
                        doc_ids_in_run.add(chunk["doc_id"])

                    try:
                        await asyncio.to_thread(
                            client.upsert,
                            collection_name=LEGAL_COLLECTION,
                            points=points_to_upsert,
                        )
                        inserted += len(points_to_upsert)
                    except Exception as e:
                        console.print(f"  [red]Qdrant upsert error: {str(e)[:100]}[/red]")
                        with state_lock:
                            for did in set(c["doc_id"] for c in batch_chunks):
                                prev = state.get("embed_errors", {}).get(did, {"attempts": 0})
                                state.setdefault("embed_errors", {})[did] = {
                                    "error": f"Qdrant upsert failed: {str(e)[:120]}",
                                    "attempts": prev["attempts"] + 1,
                                }
                        failed_batches += 1

                completed += 1
                if completed % 20 == 0 or completed == total:
                    console.print(f"  📊 Progress: {completed}/{total} batches | {inserted} chunks stored | {failed_batches} failed")

                # Periodic state save
                if completed % 50 == 0:
                    with state_lock:
                        state["embedded"] = list(set(state["embedded"]) | doc_ids_in_run)
                        state["stats"]["total_embedded"] = base_total_embedded + inserted
                        state["stats"]["embed_errors"] = len(state.get("embed_errors", {}))
                        save_ingest_state(state)

            # Run all tasks with controlled concurrency
            await asyncio.gather(*[process_one(bc, k, s) for bc, k, s in tasks])

    asyncio.run(process_all())

    # Final state save
    state["embedded"] = list(set(state["embedded"]) | doc_ids_in_run)
    state["stats"]["total_embedded"] = base_total_embedded + inserted
    state["stats"]["embed_errors"] = len(state.get("embed_errors", {}))
    save_ingest_state(state)

    try:
        client.close()
    except Exception:
        pass

    console.print(
        f"\n  ✅ Embedded & stored: {inserted} chunks | "
        f"⚠ {failed_batches} failed batches"
    )


def backfill_existing_payload_metadata(meta_by_doc: dict, batch_size: int = 1000):
    """Backfill all details-page metadata fields into existing Qdrant points."""
    if not meta_by_doc:
        console.print("[yellow]No metadata loaded from regulations_meta.json.[/yellow]")
        return

    if batch_size <= 0:
        batch_size = 1000

    try:
        client = get_qdrant_client()
        ensure_legal_collection(client)
    except Exception as e:
        console.print(f"[red]Qdrant setup error: {str(e)[:120]}[/red]")
        return

    scanned = 0
    patched = 0
    offset = None

    console.print(
        f"\n[bold blue]Backfill existing Qdrant payload metadata[/bold blue]\n"
        f"  Collection: {LEGAL_COLLECTION}\n"
        f"  Batch size: {batch_size}"
    )

    while True:
        points, next_offset = client.scroll(
            collection_name=LEGAL_COLLECTION,
            limit=batch_size,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )

        if not points:
            break

        scanned += len(points)
        ids_by_doc: dict[str, list] = {}

        for point in points:
            payload = point.payload or {}
            doc_id = payload.get("doc_id")
            if doc_id is None:
                continue
            doc_id = str(doc_id)
            if doc_id not in meta_by_doc:
                continue
            ids_by_doc.setdefault(doc_id, []).append(point.id)

        for doc_id, point_ids in ids_by_doc.items():
            doc_meta = meta_by_doc.get(doc_id, {})
            if isinstance(doc_meta, dict) and doc_meta:
                client.set_payload(
                    collection_name=LEGAL_COLLECTION,
                    payload=doc_meta,
                    points=point_ids,
                )
                patched += len(point_ids)

        if scanned % max(batch_size * 20, 2000) == 0:
            console.print(f"  📊 Scanned {scanned} points | patched {patched}")

        if next_offset is None:
            break
        offset = next_offset

    try:
        client.close()
    except Exception:
        pass

    console.print(
        f"\n  ✅ Backfill complete\n"
        f"  Points scanned: {scanned}\n"
        f"  Points patched: {patched}"
    )


# ================================================================
# STATS
# ================================================================

def print_stats():
    state = load_ingest_state()
    s = state["stats"]

    console.rule("TanyaHukum Ingestion Stats")
    console.print(f"  Total PDFs         : {s['total_pdfs']}")
    console.print(f"  Parsed (success)   : [green]{s['parsed_success']}[/green]")
    console.print(f"  Parsed (error)     : [red]{s['parsed_error']}[/red]")
    console.print(f"  Parsed (empty)     : [yellow]{s['parsed_empty']}[/yellow]")
    console.print(f"  Total chunks       : {s['total_chunks']}")
    console.print(f"  Embedded chunks    : [green]{s['total_embedded']}[/green]")
    console.print(f"  Docs embedded      : {len(state['embedded'])}")
    console.print(f"  Embed errors       : [red]{s.get('embed_errors', 0)}[/red]")
    console.print(f"  Last updated       : {state.get('last_updated', 'never')}")

    # Show error samples
    errors = {k: v for k, v in state["parsed"].items() if v.get("status") == "error"}
    if errors:
        console.print(f"\n  [red]Sample errors ({len(errors)} total):[/red]")
        for doc_id, info in list(errors.items())[:5]:
            console.print(f"    {info.get('file', doc_id)}: {info.get('error', '?')[:80]}")


# ================================================================
# CLI
# ================================================================

def main():
    parser = argparse.ArgumentParser(description="TanyaHukum Ingestion Pipeline")
    parser.add_argument("--stats",        action="store_true", help="Show ingestion stats")
    parser.add_argument("--retry-errors", action="store_true", help="Retry previously failed PDFs")
    parser.add_argument("--parse-only",   action="store_true", help="Parse + chunk only (no embedding)")
    parser.add_argument("--backfill-metadata", action="store_true",
                        help="Backfill all details metadata into existing Qdrant chunks")
    parser.add_argument("--backfill-batch-size", type=int, default=1000,
                        help="Batch size for Qdrant metadata backfill (default: 1000)")
    args = parser.parse_args()

    if args.stats:
        print_stats()
        return

    if not QDRANT_URL:
        console.print("[red]Error: QDRANT_URL not set in .env[/red]")
        return

    state = load_ingest_state()
    meta  = load_meta()

    if args.backfill_metadata:
        backfill_existing_payload_metadata(meta, batch_size=args.backfill_batch_size)
        return

    # If state is partially missing (e.g., older or interrupted formats), recover from Qdrant payloads.
    recover_state_from_qdrant_if_needed(state, meta)

    console.rule("TanyaHukum Ingestion Pipeline")

    # Step 1+2: Parse & Chunk
    chunks = run_parse(state, meta, retry_errors=args.retry_errors)

    if args.parse_only:
        console.print("\n[yellow]--parse-only: skipping embedding step.[/yellow]")
        print_stats()
        return

    # Also load chunks from previously parsed but not yet embedded docs
    if not chunks:
        # Re-parse only the unembedded docs to get their chunks
        embedded_set = set(state["embedded"])
        unembedded = [
            (REGULATIONS_DIR / info["file"], doc_id)
            for doc_id, info in state["parsed"].items()
            if info["status"] == "success" and doc_id not in embedded_set
        ]
        if unembedded:
            console.print(f"\n[yellow]Loading {len(unembedded)} previously parsed but unembedded docs...[/yellow]")
            for pdf_path, doc_id in unembedded:
                if pdf_path.exists():
                    try:
                        text = extract_text(pdf_path)
                        doc_meta = meta.get(doc_id, {"id": doc_id, "title": pdf_path.stem})
                        chunks.extend(chunk_by_pasal(text, doc_id, doc_meta))
                    except Exception:
                        pass

    # Step 3+4: Embed & Store
    run_embed_and_store(chunks, state, meta)

    console.rule("INGESTION COMPLETE")
    print_stats()


if __name__ == "__main__":
    main()
