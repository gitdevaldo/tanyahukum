# BPK Crawler Scripts

Crawler utilities for fetching BPK regulations and validating safe request throughput.

## Files

- `crawl_bpk_v2.py` — main BPK crawler (active)
- `test_bpk_rate_limit.py` — proxy/tunnel rate benchmark utility

## `crawl_bpk_v2.py` key arguments

- `--proxy`: proxy URL or `user:pass@host:port`
- `--rate-profile`: `rotating` or `local`
- `--workers`: concurrent workers (overrides profile default)
- `--max-rpm`: global requests/minute cap across all workers (`0` = unlimited)
- `--backoff-retries`: retry count for `429` and transient failures
- `--backoff-initial`, `--backoff-max`, `--backoff-factor`, `--backoff-jitter`: backoff tuning

## Recommended commands

Local tunnel profile (single IP):

```bash
python3 scripts/crawler/crawl_bpk_v2.py \
  --proxy socks5h://localhost:1080 \
  --rate-profile local \
  --relevant-only
```

Rotating proxy profile:

```bash
python3 scripts/crawler/crawl_bpk_v2.py \
  --proxy user:pass@host:port \
  --rate-profile rotating \
  --relevant-only
```

Manual override example:

```bash
python3 scripts/crawler/crawl_bpk_v2.py \
  --proxy socks5h://localhost:1080 \
  --workers 4 \
  --max-rpm 850 \
  --backoff-retries 6 \
  --relevant-only
```

Rate benchmark:

```bash
python3 scripts/crawler/test_bpk_rate_limit.py \
  --proxy socks5h://localhost:1080 \
  --url '/Search?tema=46&p=1' \
  --rpms 60,120,180,240,300,360 \
  --samples 20
```
