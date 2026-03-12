"""
TanyaHukum — Ingestion Pipeline
=================================
Parses regulation PDFs → chunks by pasal → embeds with Mistral → stores in MongoDB Atlas.

USAGE:
  python3 scripts/ingest.py                    # full ingestion
  python3 scripts/ingest.py --stats            # show ingestion stats
  python3 scripts/ingest.py --retry-errors     # retry previously failed PDFs
  python3 scripts/ingest.py --parse-only       # parse + chunk only (no embedding)

REQUIREMENTS:
  pip install pymupdf pymongo python-dotenv requests rich
"""

import os
import re
import json
import time
import argparse
import requests
import fitz  # PyMuPDF
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.operations import InsertOne

try:
    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeElapsedColumn
    console = Console()
except ImportError:
    print("ERROR: pip install rich")
    exit(1)

load_dotenv()

# ── Config ────────────────────────────────────────────────────────
REGULATIONS_DIR = Path("data/regulations")
META_F          = Path("data/regulations_meta.json")
INGEST_STATE_F  = Path("data/ingest_state.json")

MONGODB_URI     = os.getenv("MONGODB_URI")
MONGODB_DB      = os.getenv("MONGODB_DB", "tanyahukum")
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
        with open(INGEST_STATE_F) as f:
            state = json.load(f)
        # Backfill new fields for old state files
        state.setdefault("embed_errors", {})
        state["stats"].setdefault("embed_errors", 0)
        return state
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

def save_ingest_state(state: dict):
    state["last_updated"] = datetime.now().isoformat()
    with open(INGEST_STATE_F, "w") as f:
        json.dump(state, f, indent=2)

def load_meta() -> dict:
    if META_F.exists():
        with open(META_F) as f:
            data = json.load(f)
            return {r["id"]: r for r in data if r.get("id")}
    return {}


# ================================================================
# MISTRAL API KEY (auto-refresh)
# ================================================================

_mistral_key = os.getenv("MISTRAL_API_KEY", "")

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


def _call_mistral_embed(texts: list[str], key: str) -> tuple[list[list[float]] | None, str]:
    """Low-level Mistral embed call. Returns (embeddings, updated_key) or (None, key)."""
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
    """Embed a batch of texts using Mistral API. Returns list of embeddings or None on failure."""
    key = get_mistral_key()

    # Sanitize all texts before sending
    texts = [sanitize_text(t) for t in texts]

    # Try the whole batch first
    result, key = _call_mistral_embed(texts, key)
    if result is not None:
        return result

    # Batch got 400 — fallback: embed one-by-one, use zero vector for bad ones
    console.print(f"  [yellow]Batch 400 error, falling back to single-item embed ({len(texts)} items)...[/yellow]")
    zero_vec = [0.0] * 1024
    embeddings = []
    bad_count = 0
    for i, text in enumerate(texts):
        single, key = _call_mistral_embed([text], key)
        if single is not None:
            embeddings.append(single[0])
        else:
            bad_count += 1
            embeddings.append(zero_vec)
        time.sleep(0.2)  # respect rate limit in fallback mode

    if bad_count:
        console.print(f"  [yellow]  {bad_count}/{len(texts)} chunks got zero vectors (bad input)[/yellow]")
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
# STEP 4: STORE IN MONGODB
# ================================================================

def get_mongo_collection():
    """Get MongoDB collection for legal chunks."""
    client = MongoClient(MONGODB_URI)
    db = client[MONGODB_DB]
    return db["legal_chunks"], client


def ensure_vector_index(collection):
    """Create vector search index if it doesn't exist."""
    existing = list(collection.list_search_indexes())
    if not any(idx.get("name") == "vector_index" for idx in existing):
        collection.create_search_index({
            "definition": {
                "mappings": {
                    "dynamic": True,
                    "fields": {
                        "embedding": {
                            "type": "knnVector",
                            "dimensions": 1024,
                            "similarity": "cosine",
                        }
                    }
                }
            },
            "name": "vector_index",
        })
        console.print("  ✅ Created MongoDB vector search index")


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


def run_embed_and_store(chunks: list[dict], state: dict):
    """Step 3+4: Embed chunks with Mistral and store in MongoDB."""
    if not chunks:
        console.print("[yellow]No chunks to embed.[/yellow]")
        return

    # Filter out chunks for already-embedded docs
    embedded_set = set(state["embedded"])
    to_embed = [c for c in chunks if c["doc_id"] not in embedded_set]

    if not to_embed:
        console.print("[yellow]All chunks already embedded.[/yellow]")
        return

    console.print(f"\n[bold blue]Step 3+4: Embed & Store[/bold blue]")
    console.print(f"  Chunks to embed: {len(to_embed)}")

    # Build batches
    batches = build_batches(to_embed)
    console.print(f"  Batches: {len(batches)} (at {MISTRAL_RPS} req/sec)")

    collection, client = get_mongo_collection()

    # Ensure collection exists before creating index
    db = client[MONGODB_DB]
    if "legal_chunks" not in db.list_collection_names():
        db.create_collection("legal_chunks")
        console.print("  ✅ Created 'legal_chunks' collection")

    # Create vector index
    try:
        ensure_vector_index(collection)
    except Exception as e:
        console.print(f"  [yellow]Vector index note: {str(e)[:100]}[/yellow]")

    # Track which doc_ids are in this run for batch state updates
    doc_ids_in_run = set()
    failed_batches = 0
    inserted = 0
    rate_interval = 1.0 / MISTRAL_RPS  # time between requests

    with Progress(
        SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
        BarColumn(), TextColumn("{task.completed}/{task.total}"),
        TimeElapsedColumn(), console=console
    ) as progress:
        task = progress.add_task("Embedding & storing", total=len(batches))

        for batch_indices in batches:
            batch_start = time.time()

            batch_chunks = [to_embed[i] for i in batch_indices]
            texts = [c["content"] for c in batch_chunks]

            embeddings = embed_batch(texts)

            if embeddings is None:
                # Track which doc_ids failed embedding
                failed_doc_ids = set(c["doc_id"] for c in batch_chunks)
                if "embed_errors" not in state:
                    state["embed_errors"] = {}
                for did in failed_doc_ids:
                    prev = state["embed_errors"].get(did, {"attempts": 0})
                    state["embed_errors"][did] = {
                        "error": "Mistral returned None (400 or timeout)",
                        "attempts": prev["attempts"] + 1,
                    }
                failed_batches += 1
                progress.advance(task)
                continue

            # Build MongoDB documents
            docs_to_insert = []
            for chunk, embedding in zip(batch_chunks, embeddings):
                docs_to_insert.append({
                    "doc_id":     chunk["doc_id"],
                    "pasal_ref":  chunk["pasal_ref"],
                    "content":    chunk["content"],
                    "source":     chunk["source"],
                    "bentuk":     chunk["bentuk"],
                    "nomor":      chunk["nomor"],
                    "tahun":      chunk["tahun"],
                    "subjek":     chunk["subjek"],
                    "chunk_type": chunk["chunk_type"],
                    "embedding":  embedding,
                    "created_at": datetime.now().isoformat(),
                })
                doc_ids_in_run.add(chunk["doc_id"])

            # Batch insert to MongoDB
            try:
                collection.insert_many(docs_to_insert)
                inserted += len(docs_to_insert)
            except Exception as e:
                console.print(f"  [red]MongoDB insert error: {str(e)[:80]}[/red]")
                failed_batches += 1

            progress.advance(task)

            # Rate limiting
            elapsed = time.time() - batch_start
            if elapsed < rate_interval:
                time.sleep(rate_interval - elapsed)

            # Save state every 50 batches
            if (progress.tasks[task].completed % 50) == 0:
                state["embedded"] = list(set(state["embedded"]) | doc_ids_in_run)
                state["stats"]["total_embedded"] = inserted
                save_ingest_state(state)

    # Final state save
    state["embedded"] = list(set(state["embedded"]) | doc_ids_in_run)
    state["stats"]["total_embedded"] += inserted
    state["stats"]["embed_errors"] = len(state.get("embed_errors", {}))
    save_ingest_state(state)

    client.close()

    console.print(
        f"\n  ✅ Embedded & stored: {inserted} chunks | "
        f"⚠ {failed_batches} failed batches"
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
    args = parser.parse_args()

    if args.stats:
        print_stats()
        return

    if not MONGODB_URI:
        console.print("[red]Error: MONGODB_URI not set in .env[/red]")
        return

    state = load_ingest_state()
    meta  = load_meta()

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
    run_embed_and_store(chunks, state)

    console.rule("INGESTION COMPLETE")
    print_stats()


if __name__ == "__main__":
    main()
