# BPK Crawler Scripts

This folder contains operational scripts for TanyaHukum data pipelines.

## Active BPK crawler

- `crawl_bpk_v2.py` is the crawler used for scraping BPK regulation pages and downloading PDFs.
- `crawl_bpk.py` (Firecrawl-based) has been removed.
- `ingest.py` parses downloaded PDFs, builds legal chunks, embeds with Mistral, and writes vectors to Qdrant (`legal_chunks`).

## Why rate controls matter

When using a rotating proxy, requests are distributed across many IPs.

When using a local tunnel (single IP), BPK/Cloudflare limits hit faster, so traffic needs stricter pacing and retry behavior.

## `crawl_bpk_v2.py` key arguments

- `--proxy`: proxy URL or `user:pass@host:port`
- `--rate-profile`: `rotating` or `local`
- `--workers`: concurrent workers (overrides profile default)
- `--max-rpm`: global requests/minute cap across all workers (`0` = unlimited)
- `--backoff-retries`: retry count on `429` and transient upstream failures
- `--backoff-initial`, `--backoff-max`, `--backoff-factor`, `--backoff-jitter`: backoff tuning

## Recommended usage

### Local tunnel profile (single IP)

```bash
python3 scripts/crawl_bpk_v2.py \
  --proxy socks5h://localhost:1080 \
  --rate-profile local \
  --relevant-only
```

### Rotating proxy profile

```bash
python3 scripts/crawl_bpk_v2.py \
  --proxy user:pass@host:port \
  --rate-profile rotating \
  --relevant-only
```

### Manual override example

```bash
python3 scripts/crawl_bpk_v2.py \
  --proxy socks5h://localhost:1080 \
  --workers 4 \
  --max-rpm 850 \
  --backoff-retries 6 \
  --relevant-only
```

## RPM stress testing utility

Use `test_bpk_rate_limit.py` to measure practical throughput with the current network path before long crawls.

```bash
python3 scripts/test_bpk_rate_limit.py \
  --proxy socks5h://localhost:1080 \
  --url '/Search?tema=46&p=1' \
  --rpms 60,120,180,240,300,360 \
  --samples 20
```

The output shows pass/fail by stage and helps pick stable operating limits.
