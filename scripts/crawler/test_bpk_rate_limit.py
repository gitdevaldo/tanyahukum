#!/usr/bin/env python3
"""
Probe BPK rate-limit behavior through a proxy and suggest a safe delay.

Examples:
  python3 scripts/crawler/test_bpk_rate_limit.py --proxy socks5h://localhost:1080
  python3 scripts/crawler/test_bpk_rate_limit.py --proxy user:pass@host:port --samples 20
  python3 scripts/crawler/test_bpk_rate_limit.py --proxy socks5h://localhost:1080 --delays 2,1.5,1,0.75,0.5
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import time
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from requests import Session

BASE_URL = "https://peraturan.bpk.go.id"
DEFAULT_DELAYS = [2.0, 1.5, 1.0, 0.75, 0.5, 0.35, 0.25]
SOFT_BLOCK_MARKERS = (
    "attention required",
    "cloudflare",
    "captcha",
    "too many requests",
    "rate limit",
)


@dataclass
class ProbeResult:
    index: int
    status_code: int | None
    latency_ms: float
    error: str | None
    soft_block: bool


@dataclass
class StageSummary:
    delay_seconds: float
    requests_per_minute: float
    total_requests: int
    success_count: int
    error_count: int
    soft_block_count: int
    status_counts: dict[str, int]
    p50_latency_ms: float
    p95_latency_ms: float
    passed: bool
    fail_reason: str | None


def parse_delays(raw: str) -> list[float]:
    delays: list[float] = []
    for part in raw.split(","):
        value = part.strip()
        if not value:
            continue
        try:
            parsed = float(value)
        except ValueError as exc:
            raise argparse.ArgumentTypeError(f"Invalid delay value: {value}") from exc
        if parsed <= 0:
            raise argparse.ArgumentTypeError("Delay must be > 0.")
        delays.append(parsed)
    if not delays:
        raise argparse.ArgumentTypeError("At least one delay is required.")
    unique = sorted(set(delays), reverse=True)
    return unique


def parse_rpms(raw: str) -> list[float]:
    rpms: list[float] = []
    for part in raw.split(","):
        value = part.strip()
        if not value:
            continue
        try:
            parsed = float(value)
        except ValueError as exc:
            raise argparse.ArgumentTypeError(f"Invalid RPM value: {value}") from exc
        if parsed <= 0:
            raise argparse.ArgumentTypeError("RPM must be > 0.")
        rpms.append(parsed)
    if not rpms:
        raise argparse.ArgumentTypeError("At least one RPM is required.")
    return sorted(set(rpms))


def normalize_proxy(raw_proxy: str | None) -> str:
    proxy = (raw_proxy or "").strip()
    if not proxy:
        raise ValueError("Proxy is required. Use --proxy or BPK_PROXY.")
    if proxy.startswith(("http://", "https://", "socks5://", "socks5h://")):
        return proxy
    return f"http://{proxy}"


def normalize_target_url(raw_url: str) -> str:
    value = raw_url.strip()
    if not value:
        raise ValueError("Target URL/path cannot be empty.")
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if not value.startswith("/"):
        value = f"/{value}"
    return urljoin(BASE_URL, value)


def make_session(proxy_url: str) -> Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": BASE_URL,
        }
    )
    session.proxies = {"http": proxy_url, "https": proxy_url}
    return session


def _is_soft_block(response_text: str, status_code: int | None) -> bool:
    if status_code == 429:
        return True
    text = response_text.lower()
    return any(marker in text for marker in SOFT_BLOCK_MARKERS)


def run_probe(session: Session, url: str, timeout_seconds: float, index: int) -> ProbeResult:
    started = time.perf_counter()
    try:
        response = session.get(url, timeout=timeout_seconds)
        latency_ms = (time.perf_counter() - started) * 1000
        soft_block = _is_soft_block(response.text[:6000], response.status_code)
        return ProbeResult(
            index=index,
            status_code=response.status_code,
            latency_ms=latency_ms,
            error=None,
            soft_block=soft_block,
        )
    except Exception as exc:
        latency_ms = (time.perf_counter() - started) * 1000
        return ProbeResult(
            index=index,
            status_code=None,
            latency_ms=latency_ms,
            error=str(exc),
            soft_block=False,
        )


def summarize_stage(
    delay_seconds: float,
    results: list[ProbeResult],
    min_success_rate: float,
) -> StageSummary:
    total = len(results)
    success_count = sum(1 for r in results if r.status_code is not None and 200 <= r.status_code < 400 and not r.soft_block)
    error_count = sum(1 for r in results if r.error is not None)
    soft_block_count = sum(1 for r in results if r.soft_block)
    latencies = [r.latency_ms for r in results]
    status_counter = Counter(str(r.status_code) for r in results if r.status_code is not None)
    success_rate = (success_count / total) if total else 0.0

    fail_reason: str | None = None
    passed = True
    if total == 0:
        passed = False
        fail_reason = "No requests were executed."
    elif error_count > 0:
        passed = False
        fail_reason = "Transport/proxy errors detected."
    elif soft_block_count > 0:
        passed = False
        fail_reason = "Rate-limit/challenge behavior detected (429 or Cloudflare page)."
    elif success_rate < min_success_rate:
        passed = False
        fail_reason = f"Success rate {success_rate:.1%} below threshold {min_success_rate:.1%}."

    p50 = statistics.median(latencies) if latencies else 0.0
    p95 = statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max(latencies, default=0.0)

    return StageSummary(
        delay_seconds=delay_seconds,
        requests_per_minute=60.0 / delay_seconds,
        total_requests=total,
        success_count=success_count,
        error_count=error_count,
        soft_block_count=soft_block_count,
        status_counts=dict(status_counter),
        p50_latency_ms=p50,
        p95_latency_ms=p95,
        passed=passed,
        fail_reason=fail_reason,
    )


def run_stage(
    session: Session,
    url: str,
    delay_seconds: float,
    samples: int,
    timeout_seconds: float,
) -> list[ProbeResult]:
    results: list[ProbeResult] = []
    stage_started = time.perf_counter()
    for i in range(samples):
        result = run_probe(session, url, timeout_seconds, i + 1)
        results.append(result)
        if i + 1 >= samples:
            continue
        next_target = stage_started + ((i + 1) * delay_seconds)
        sleep_for = next_target - time.perf_counter()
        if sleep_for > 0:
            time.sleep(sleep_for)
    return results


def recommend_delay(stages: list[StageSummary], safety_factor: float) -> float | None:
    passed = [stage for stage in stages if stage.passed]
    if not passed:
        return None
    fastest_pass = min(passed, key=lambda stage: stage.delay_seconds)
    return fastest_pass.delay_seconds * safety_factor


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Test BPK max safe request rate through proxy.")
    parser.add_argument(
        "--proxy",
        default=os.getenv("BPK_PROXY") or "socks5h://localhost:1080",
        help="Proxy URL or user:pass@host:port (default: socks5h://localhost:1080).",
    )
    parser.add_argument(
        "--url",
        default="/Search?tema=46&p=1",
        help="BPK URL or path to probe (default: /Search?tema=46&p=1).",
    )
    parser.add_argument(
        "--rpms",
        default=None,
        help="Comma-separated RPM stages (recommended), e.g. 30,60,90,120.",
    )
    parser.add_argument(
        "--delays",
        default=",".join(str(d) for d in DEFAULT_DELAYS),
        help="Comma-separated delay stages in seconds (legacy input).",
    )
    parser.add_argument("--samples", type=int, default=16, help="Requests per stage.")
    parser.add_argument("--timeout", type=float, default=25.0, help="Request timeout in seconds.")
    parser.add_argument("--min-success-rate", type=float, default=0.95, help="Pass threshold (0-1).")
    parser.add_argument(
        "--safety-factor",
        type=float,
        default=1.25,
        help="Multiplier on fastest passing delay for final recommendation.",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        default=None,
        help="Optional output path for JSON summary.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.samples <= 0:
        raise SystemExit("--samples must be > 0.")
    if args.timeout <= 0:
        raise SystemExit("--timeout must be > 0.")
    if not (0 < args.min_success_rate <= 1):
        raise SystemExit("--min-success-rate must be in (0, 1].")
    if args.safety_factor <= 0:
        raise SystemExit("--safety-factor must be > 0.")

    if args.rpms:
        rpms = parse_rpms(args.rpms)
        delays = [60.0 / rpm for rpm in rpms]
    else:
        delays = parse_delays(args.delays)
        rpms = [60.0 / delay for delay in delays]

    proxy_url = normalize_proxy(args.proxy)
    target_url = normalize_target_url(args.url)
    session = make_session(proxy_url)

    now = datetime.now(timezone.utc).isoformat()
    print(f"[{now}] BPK rate probe starting")
    print(f"Proxy: {proxy_url}")
    print(f"Target: {target_url}")
    print(f"Stages (RPM): {', '.join(f'{rpm:.1f}' for rpm in rpms)}")
    print(f"Samples per stage: {args.samples}")
    print("-" * 78)

    stage_summaries: list[StageSummary] = []
    for delay in delays:
        results = run_stage(
            session=session,
            url=target_url,
            delay_seconds=delay,
            samples=args.samples,
            timeout_seconds=args.timeout,
        )
        summary = summarize_stage(delay, results, min_success_rate=args.min_success_rate)
        stage_summaries.append(summary)

        pass_fail = "PASS" if summary.passed else "FAIL"
        print(
            f"delay={summary.delay_seconds:.3f}s ({summary.requests_per_minute:.1f}/min) "
            f"ok={summary.success_count}/{summary.total_requests} "
            f"errors={summary.error_count} soft_blocks={summary.soft_block_count} "
            f"p50={summary.p50_latency_ms:.0f}ms p95={summary.p95_latency_ms:.0f}ms -> {pass_fail}"
        )
        print(f"  status_counts={summary.status_counts}")
        if not summary.passed:
            print(f"  reason={summary.fail_reason}")
            break

    recommended_delay = recommend_delay(stage_summaries, args.safety_factor)
    if recommended_delay is None:
        print("\nNo passing stage found. Increase delays and retry.")
    else:
        rpm = 60.0 / recommended_delay
        print("\nRecommended safe delay:")
        print(
            f"  {recommended_delay:.3f}s between requests "
            f"(~{rpm:.1f} requests/minute) with safety factor {args.safety_factor:.2f}"
        )

    if args.output_json:
        payload: dict[str, Any] = {
            "timestamp": now,
            "proxy": proxy_url,
            "target": target_url,
            "samples_per_stage": args.samples,
            "rpms_tested": rpms,
            "delays_tested": delays,
            "min_success_rate": args.min_success_rate,
            "safety_factor": args.safety_factor,
            "recommended_delay_seconds": recommended_delay,
            "stages": [asdict(stage) for stage in stage_summaries],
        }
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(json.dumps(payload, ensure_ascii=True, indent=2))
        print(f"Saved JSON report to: {args.output_json}")


if __name__ == "__main__":
    main()
