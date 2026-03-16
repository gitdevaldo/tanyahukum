# Ingest Script

Ingestion pipeline for TanyaHukum regulation PDFs.

Flow:

1. Read downloaded PDFs from `data/regulations/`
2. Parse + chunk legal text
3. Generate embeddings
4. Upsert vectors to Qdrant collection `legal_chunks`
5. Persist progress in `data/ingest_state.json`

## File

- `ingest.py` — main ingestion entrypoint

## Commands

Run full ingestion:

```bash
python3 scripts/ingest/ingest.py
```

Show ingestion stats:

```bash
python3 scripts/ingest/ingest.py --stats
```

Retry previously failed PDFs:

```bash
python3 scripts/ingest/ingest.py --retry-errors
```

Parse/chunk only (skip embeddings):

```bash
python3 scripts/ingest/ingest.py --parse-only
```
