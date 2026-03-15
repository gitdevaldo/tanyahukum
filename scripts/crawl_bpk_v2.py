"""
TanyaHukum - BPK Automatic Crawler
=====================================
Fully automatic. Zero manual input. Based on REAL page structure.
Uses requests + BeautifulSoup with an Indonesian proxy to bypass
Cloudflare geo-blocking.

DISCOVERED PAGE STRUCTURE:
  /Subjek       → subject cards with <a href="/Search?tema=ID">COUNT</a>
  /Search?tema=X&p=N → regulation cards with Details links + pagination
  /Details/ID   → authoritative source: clear Status field + Download link

FLOW:
  1. Scrape /Subjek          → get all {tema_id: name, count}
  2. For each tema:
       a. Fetch page 1        → grab LAST page number from pagination
       b. Fetch pages 1..N    → collect Details URLs for each regulation
       c. For each regulation  → fetch /Details page
       d. "Berlaku"           → download PDF ✅
       e. "Dicabut"           → skip ❌
  3. Save meta + progress on every download → safe to CTRL+C
  4. Resume is always on — reruns skip already-downloaded regulations

USAGE:
  pip install requests beautifulsoup4 rich

  python3 scripts/crawl_bpk_v2.py --relevant-only --proxy socks5h://localhost:1080 --rate-profile local
  python3 scripts/crawl_bpk_v2.py --tema 46 --proxy user:pass@host:port --rate-profile rotating
  python3 scripts/crawl_bpk_v2.py --proxy user:pass@host:port --max-rpm 800 --workers 4
  python3 scripts/crawl_bpk_v2.py --stats

OUTPUT:
  data/regulations/           <- PDFs (Berlaku only)
  data/crawl_progress.json    <- resume state
  data/regulations_meta.json  <- metadata for downloaded regulations
"""

import os
import re
import json
import argparse
import random
import threading
import time
import requests
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from bs4 import BeautifulSoup

try:
    from rich.console import Console
    console = Console()
except ImportError:
    print("ERROR: pip install rich")
    exit(1)

# ── Config ────────────────────────────────────────────────────────
BASE_URL            = "https://peraturan.bpk.go.id"
OUT_DIR             = Path("data/regulations")
PROGRESS_F          = Path("data/crawl_progress.json")
META_F              = Path("data/regulations_meta.json")
OUT_DIR.mkdir(parents=True, exist_ok=True)
Path("data").mkdir(exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": BASE_URL,
}

SOFT_BLOCK_MARKERS = (
    "too many requests",
    "attention required",
    "cloudflare",
    "captcha",
    "rate limit",
)

RATE_PROFILES = {
    "rotating": {
        "workers": 10,
        "max_rpm": 0.0,  # unlimited unless overridden
        "backoff_retries": 3,
        "backoff_initial": 0.5,
        "backoff_max": 6.0,
        "backoff_factor": 2.0,
        "backoff_jitter": 0.25,
    },
    "local": {
        "workers": 4,
        "max_rpm": 840.0,
        "backoff_retries": 6,
        "backoff_initial": 1.0,
        "backoff_max": 20.0,
        "backoff_factor": 2.0,
        "backoff_jitter": 0.5,
    },
}

# ── TanyaHukum relevant subjects ─────────────────────────────────
RELEVANT_TOPICS = {
    "16":  "Hukum Pidana, Perdata, dan Dagang",
    "24":  "Ketenagakerjaan",
    "46":  "Perlindungan Konsumen",
    "44":  "Perbankan, Lembaga Keuangan",
    "88":  "Koperasi, UMKM",
    "47":  "Perlindungan Usaha, Perusahaan, Perdagangan",
    "74":  "Perekonomian",
    "33":  "Pasar Modal dan Perdagangan Berjangka",
    "55":  "Telekomunikasi, Informatika, Siber",
    "63":  "Perizinan, Pelayanan Publik",
    "11":  "Fidusia dan Lembaga Pembiayaan",
    "123": "Arbitrase",
    "96":  "Monopoli dan Persaingan Usaha",
    "29":  "Pencucian Uang",
    "92":  "Cipta Kerja",
    "6":   "Asuransi",
}


# ================================================================
# HTTP SESSION
# ================================================================

def normalize_proxy(proxy_str: str | None) -> str | None:
    value = (proxy_str or "").strip()
    if not value:
        return None
    if value.startswith(("http://", "https://", "socks5://", "socks5h://")):
        return value
    return f"http://{value}"


def _is_soft_block(status_code: int, body_text: str | None) -> bool:
    if status_code == 429:
        return True
    lowered = (body_text or "").lower()
    return any(marker in lowered for marker in SOFT_BLOCK_MARKERS)


class RequestPolicy:
    """Global request pacing and retry/backoff policy shared across workers."""

    def __init__(
        self,
        *,
        max_rpm: float,
        backoff_retries: int,
        backoff_initial: float,
        backoff_max: float,
        backoff_factor: float,
        backoff_jitter: float,
    ) -> None:
        self.max_rpm = max_rpm if max_rpm > 0 else 0.0
        self.backoff_retries = max(0, backoff_retries)
        self.backoff_initial = max(0.0, backoff_initial)
        self.backoff_max = max(self.backoff_initial, backoff_max)
        self.backoff_factor = max(1.0, backoff_factor)
        self.backoff_jitter = max(0.0, backoff_jitter)
        self._min_interval = (60.0 / self.max_rpm) if self.max_rpm > 0 else 0.0
        self._lock = threading.Lock()
        self._next_request_at = 0.0
        self._backoff_until = 0.0

    def wait_for_slot(self) -> None:
        """Block until this thread can send the next request."""
        while True:
            now = time.monotonic()
            with self._lock:
                wait_for = 0.0
                if self._backoff_until > now:
                    wait_for = self._backoff_until - now
                elif self._min_interval <= 0:
                    return
                elif self._next_request_at <= now:
                    self._next_request_at = now + self._min_interval
                    return
                else:
                    wait_for = self._next_request_at - now

            if wait_for > 0:
                time.sleep(wait_for)

    def apply_backoff(self, attempt: int) -> float:
        """Increase global cooldown after throttling/transient errors."""
        base = self.backoff_initial * (self.backoff_factor ** max(0, attempt - 1))
        wait_seconds = min(self.backoff_max, base)
        if self.backoff_jitter > 0:
            wait_seconds += random.uniform(0.0, self.backoff_jitter)
        until = time.monotonic() + wait_seconds
        with self._lock:
            if until > self._backoff_until:
                self._backoff_until = until
        return wait_seconds


def get_with_policy(
    session: requests.Session,
    url: str,
    policy: RequestPolicy,
    *,
    timeout: float = 30.0,
    stream: bool = False,
    expected_pdf: bool = False,
) -> requests.Response:
    """GET with global RPM pacing and retry/backoff on throttling/transient failures."""
    max_attempts = policy.backoff_retries + 1
    for attempt in range(1, max_attempts + 1):
        policy.wait_for_slot()
        response: requests.Response | None = None
        try:
            response = session.get(url, timeout=timeout, stream=stream)
            status_code = response.status_code
            retryable = status_code in {429, 500, 502, 503, 504, 520, 522, 524}

            body_preview = ""
            if not stream:
                body_preview = response.text[:6000]
                if _is_soft_block(status_code, body_preview):
                    retryable = True
            elif expected_pdf:
                content_type = (response.headers.get("content-type") or "").lower()
                if "html" in content_type and "pdf" not in content_type:
                    retryable = True

            if retryable and attempt < max_attempts:
                wait_seconds = policy.apply_backoff(attempt)
                if response is not None:
                    response.close()
                console.print(
                    f"    [yellow]Throttle/Transient ({status_code}) → retry in {wait_seconds:.2f}s[/yellow]"
                )
                continue

            response.raise_for_status()
            return response
        except requests.RequestException:
            if response is not None:
                response.close()
            if attempt >= max_attempts:
                raise
            wait_seconds = policy.apply_backoff(attempt)
            console.print(f"    [yellow]Request failed → retry in {wait_seconds:.2f}s[/yellow]")

    raise RuntimeError("Unexpected request loop exit.")


def make_session(proxy_str: str | None) -> requests.Session:
    """Create a requests session with optional proxy."""
    s = requests.Session()
    s.headers.update(HEADERS)
    proxy_url = normalize_proxy(proxy_str)
    if proxy_url:
        s.proxies = {"http": proxy_url, "https": proxy_url}
    return s


def fetch_html(session: requests.Session, url: str, policy: RequestPolicy) -> BeautifulSoup:
    """Fetch a URL and return parsed BeautifulSoup."""
    response = get_with_policy(session, url, policy, timeout=30.0, stream=False)
    try:
        return BeautifulSoup(response.text, "html.parser")
    finally:
        response.close()


# ================================================================
# STATE / PROGRESS
# ================================================================

_save_lock = threading.Lock()

def load_progress() -> dict:
    if PROGRESS_F.exists():
        with open(PROGRESS_F) as f:
            data = json.load(f)
            data["processed_ids"] = set(data.get("processed_ids", []))
            return data
    return {
        "completed_temas": [],
        "processed_ids": set(),
        "total_downloaded": 0,
        "total_skipped": 0,
        "last_updated": None,
    }

def save_progress(p: dict):
    with _save_lock:
        p["last_updated"] = datetime.now().isoformat()
        serializable = {**p, "processed_ids": list(p["processed_ids"])}
        # M-24: Atomic write — write to temp, then rename
        tmp = PROGRESS_F.with_suffix(".tmp")
        with open(tmp, "w") as f:
            json.dump(serializable, f, indent=2)
        tmp.rename(PROGRESS_F)

def load_meta() -> dict:
    if META_F.exists():
        with open(META_F) as f:
            data = json.load(f)
            return {r["id"]: r for r in data if r.get("id")}
    return {}

def save_meta(meta: dict):
    with _save_lock:
        # M-24: Atomic write — write to temp, then rename
        tmp = META_F.with_suffix(".tmp")
        with open(tmp, "w") as f:
            json.dump(list(meta.values()), f, ensure_ascii=False, indent=2)
        tmp.rename(META_F)


# ================================================================
# STEP 1: /Subjek -> all tema IDs
#
# HTML structure:
#   <div class="my-6 d-flex justify-content-between ...">
#     <div class="fw-bold pe-4">Subject Name</div>
#     <div><a class="btn ..." href="/Search?tema=ID">COUNT</a></div>
#   </div>
# ================================================================

def discover_topics(session: requests.Session, policy: RequestPolicy) -> dict:
    """Returns {tema_id: {"name": str, "count": int}}"""
    console.print("\n[bold blue]Step 1: Discovering subjects from /Subjek...[/bold blue]")

    soup = fetch_html(session, f"{BASE_URL}/Subjek", policy)
    topics = {}

    for row in soup.select("div.my-6.d-flex"):
        name_el = row.select_one("div.fw-bold")
        link_el = row.select_one("a[href*='tema=']")
        if not name_el or not link_el:
            continue

        name = name_el.get_text(strip=True)
        count_text = link_el.get_text(strip=True).replace(",", "")
        href = link_el.get("href", "")
        m = re.search(r'tema=(\d+)', href)
        if m:
            tid = m.group(1)
            topics[tid] = {"name": name, "count": int(count_text) if count_text.isdigit() else 0}

    console.print(f"  Found [green]{len(topics)}[/green] subjects")
    return topics


# ================================================================
# STEP 2: /Search?tema=X&p=N -> collect Details URLs
#
# Search pages list regulation cards. We only extract the Details
# link and title from each card. Status + PDF download come from
# the Details page (Step 3) which is the authoritative source.
#
# HTML structure per card:
#   <div class="card-body p-xl-10">
#     <a href="/Details/ID/slug">Title</a>
#   </div>
#
# Pagination:
#   <li class="page-item"><a class="page-link" href="...p=N">Last</a></li>
# ================================================================

def get_last_page(soup: BeautifulSoup) -> int:
    """Extract last page number from pagination."""
    for link in soup.select("a.page-link"):
        if "Last" in link.get_text():
            href = link.get("href", "")
            m = re.search(r'[&?]p=(\d+)', href)
            if m:
                return int(m.group(1))
    return 1


def parse_search_page(soup: BeautifulSoup, tema_id: str, tema_name: str) -> list[dict]:
    """Parse one search results page. Returns regulation stubs with Details URLs."""
    results = []

    for card in soup.select("div.card-body.p-xl-10"):
        title_link = card.select_one("a[href*='/Details/']")
        if not title_link:
            continue

        href = title_link.get("href", "")
        m = re.search(r'/Details/(\d+)/', href)
        if not m:
            continue

        doc_id = m.group(1)
        title = title_link.get_text(strip=True)
        detail_url = f"{BASE_URL}{href}" if href.startswith("/") else href

        results.append({
            "id":         doc_id,
            "title":      title,
            "detail_url": detail_url,
            "tema_id":    tema_id,
            "tema_name":  tema_name,
        })

    return results


# ================================================================
# STEP 3: /Details/ID -> status + download URL
#
# The Details page is the authoritative source for regulation status
# and PDF download links.
#
# HTML structure:
#   <div class="col-lg-3 fw-bold">Status</div>
#   <div class="col-lg-9">Berlaku</div>
#   <a class="download-file" href="/Download/ID/file.pdf">Download</a>
# ================================================================

def parse_details_page(soup: BeautifulSoup) -> dict:
    """Parse Details page for full metadata, status, relations, and download URL."""
    result = {
        "status": "UNKNOWN",
        "is_berlaku": False,
        "download_url": None,
    }

    # ── METADATA PERATURAN ─────────────────────────────────────────
    # Each field is a row: <div class="col-lg-3 fw-bold">Label</div>
    #                       <div class="col-lg-9">Value</div>
    meta_fields = {
        "Tipe Dokumen":        "tipe_dokumen",
        "Judul":               "judul",
        "T.E.U.":              "teu",
        "Nomor":               "nomor",
        "Bentuk":              "bentuk",
        "Bentuk Singkat":      "bentuk_singkat",
        "Tahun":               "tahun",
        "Tempat Penetapan":    "tempat_penetapan",
        "Tanggal Penetapan":   "tanggal_penetapan",
        "Tanggal Pengundangan":"tanggal_pengundangan",
        "Tanggal Berlaku":     "tanggal_berlaku",
        "Sumber":              "sumber",
        "Subjek":              "subjek",
        "Status":              "status",
        "Bahasa":              "bahasa",
        "Lokasi":              "lokasi",
        "Bidang":              "bidang",
    }

    for label in soup.select("div.col-lg-3.fw-bold"):
        label_text = label.get_text(strip=True)
        if label_text in meta_fields:
            val = label.find_next_sibling("div")
            if val:
                result[meta_fields[label_text]] = val.get_text(strip=True)

    # Set status flags from parsed Status field
    status_val = result.get("status", "UNKNOWN")
    result["is_berlaku"] = status_val.lower() == "berlaku"

    # ── STATUS PERATURAN (relations) ───────────────────────────────
    # Sections like "Diubah dengan", "Mengubah", "Dicabut dengan", "Mencabut"
    for section_div in soup.select("div.fw-semibold.bg-light-primary"):
        section_name = section_div.get_text(strip=True).rstrip(" :")
        key = re.sub(r'\s+', '_', section_name.lower())
        parent_row = section_div.find_parent("div", class_="row")
        if not parent_row:
            continue
        next_row = parent_row.find_next_sibling("div", class_="row")
        if not next_row:
            continue
        links = []
        for li in next_row.select("li"):
            a = li.select_one("a[href*='/Details/']")
            if a:
                links.append({
                    "title": a.get_text(strip=True),
                    "url":   f"{BASE_URL}{a.get('href', '')}",
                    "desc":  re.sub(r'\s+', ' ', li.get_text(" ", strip=True).replace(a.get_text(strip=True), "").strip()),
                })
        if links:
            result[key] = links

    # ── Download URL ───────────────────────────────────────────────
    dl_link = soup.select_one("a.download-file[href*='/Download/']")
    if dl_link:
        dl_href = dl_link.get("href", "")
        result["download_url"] = f"{BASE_URL}{dl_href}" if dl_href.startswith("/") else dl_href

    return result


# ================================================================
# STEP 4: DOWNLOAD PDF
# ================================================================

def download_pdf(session: requests.Session, url: str, reg: dict, policy: RequestPolicy) -> bool:
    """Download PDF to data/regulations/. Returns True on success."""
    safe     = re.sub(r'[^\w\-]', '_', reg.get("title", "unknown"))
    filepath = OUT_DIR / f"{reg['id']}_{safe[:40]}.pdf"

    if filepath.exists() and filepath.stat().st_size > 10_000:
        reg["local_path"] = str(filepath)
        reg["downloaded"] = True
        return True

    response: requests.Response | None = None
    try:
        response = get_with_policy(
            session,
            url,
            policy,
            timeout=30.0,
            stream=True,
            expected_pdf=True,
        )

        ct = response.headers.get("content-type", "")
        if "html" in ct and "pdf" not in ct:
            return False

        with open(filepath, "wb") as f:
            for chunk in response.iter_content(8192):
                f.write(chunk)

        size_kb = filepath.stat().st_size / 1024
        if size_kb < 10:
            filepath.unlink()
            return False

        reg["local_path"] = str(filepath)
        reg["downloaded"] = True
        reg["size_kb"]    = round(size_kb)
        return True

    except Exception as e:
        console.print(f"    [red]Download error: {str(e)[:80]}[/red]")
        return False
    finally:
        if response is not None:
            response.close()


# ================================================================
# MAIN CRAWL LOOP
# ================================================================

def _process_one(
    session: requests.Session,
    reg: dict,
    progress: dict,
    meta: dict,
    policy: RequestPolicy,
) -> str:
    """Worker: fetch Details → download PDF. Returns 'downloaded'|'skipped'|'error'."""
    doc_id = reg["id"]

    if doc_id in progress["processed_ids"]:
        return "already"

    try:
        soup  = fetch_html(session, reg["detail_url"], policy)
        dinfo = parse_details_page(soup)
        reg.update(dinfo)

        if not reg.get("is_berlaku"):
            console.print(f"  ❌ [red]{reg.get('status','Dicabut')}[/red] — {reg['title'][:65]}")
            return "skipped"

        dl_url = reg.get("download_url")
        if not dl_url:
            console.print(f"  ⚠  No PDF URL: {reg['title'][:60]}", style="yellow")
            return "error"

        ok = download_pdf(session, dl_url, reg, policy)
        if ok:
            reg["scraped_at"] = datetime.now().isoformat()
            with _save_lock:
                meta[doc_id] = reg
                progress["processed_ids"].add(doc_id)
            # H-16: save calls are outside the lock but have their own internal locks
            save_meta(meta)
            save_progress(progress)
            console.print(
                f"  ✅ [green]{reg['title'][:70]}[/green]"
                f" ({reg.get('size_kb','?')}KB)"
            )
            return "downloaded"
        else:
            console.print(f"  ⚠  PDF failed: {reg['title'][:60]}", style="yellow")
            return "error"

    except Exception as e:
        console.print(f"  [red]Error ({doc_id}): {str(e)[:80]}[/red]")
        return "error"


def crawl_tema(
    session: requests.Session,
    tema_id: str,
    tema_name: str,
    progress: dict,
    meta: dict,
    policy: RequestPolicy,
    workers: int = 10,
):

    console.print(f"\n[bold]📂 tema={tema_id}: {tema_name}[/bold]")

    # Page 1: get total pages
    soup1 = fetch_html(session, f"{BASE_URL}/Search?tema={tema_id}&p=1", policy)
    last_page = get_last_page(soup1)
    console.print(f"  Total pages: [bold]{last_page}[/bold]")

    all_regs = parse_search_page(soup1, tema_id, tema_name)

    # Remaining pages
    for page in range(2, last_page + 1):
        console.print(f"  📄 Fetching page {page}/{last_page}...", end=" ")
        try:
            soup = fetch_html(session, f"{BASE_URL}/Search?tema={tema_id}&p={page}", policy)
            new  = parse_search_page(soup, tema_id, tema_name)
            all_regs.extend(new)
            console.print(f"[dim]+{len(new)}[/dim]")
        except KeyboardInterrupt:
            raise
        except Exception as e:
            console.print(f"[red]error: {e}[/red]")

    # Deduplicate
    seen   = set()
    unique = []
    for r in all_regs:
        if r["id"] not in seen:
            seen.add(r["id"])
            unique.append(r)

    # Filter out already processed
    todo = [r for r in unique if r["id"] not in progress["processed_ids"]]
    console.print(f"  Unique: {len(unique)} | To process: [bold]{len(todo)}[/bold] ({workers} workers)")

    # Process concurrently: Details fetch + PDF download
    downloaded = skipped = errors = 0

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(_process_one, session, reg, progress, meta, policy): reg
            for reg in todo
        }
        try:
            for future in as_completed(futures):
                result = future.result()
                if result == "downloaded":
                    downloaded += 1
                elif result == "skipped":
                    skipped += 1
                elif result == "error":
                    errors += 1
        except KeyboardInterrupt:
            console.print("\n\n[yellow]Interrupted. Saving...[/yellow]")
            pool.shutdown(wait=False, cancel_futures=True)
            save_progress(progress)
            save_meta(meta)
            console.print("[green]Saved. Run again to resume.[/green]")
            raise SystemExit(0)

    progress["completed_temas"].append(tema_id)
    progress["total_downloaded"] += downloaded
    progress["total_skipped"]    += skipped
    save_progress(progress)
    save_meta(meta)

    console.print(
        f"\n  Done: ✅ {downloaded} downloaded | "
        f"❌ {skipped} skipped | ⚠ {errors} errors"
    )


# ================================================================
# STATS
# ================================================================

def print_stats():
    meta     = load_meta()
    progress = load_progress()
    pdfs     = list(OUT_DIR.glob("*.pdf"))

    console.rule("TanyaHukum Crawl Stats")
    console.print(f"  PDFs downloaded    : [green]{len(pdfs)}[/green]")
    console.print(f"  Regulations in meta: {len(meta)}")
    console.print(f"  Temas completed    : {len(progress['completed_temas'])}")
    console.print(f"  IDs processed      : {len(progress['processed_ids'])}")
    console.print(f"  Last updated       : {progress.get('last_updated','never')}")
    if pdfs:
        total_mb = sum(p.stat().st_size for p in pdfs) / (1024 * 1024)
        console.print(f"  Total PDF size     : {total_mb:.1f} MB")


# ================================================================
# CLI
# ================================================================

def _resolve_runtime_config(args: argparse.Namespace) -> tuple[int, RequestPolicy]:
    profile = RATE_PROFILES[args.rate_profile]
    workers = args.workers if args.workers is not None else profile["workers"]
    max_rpm = args.max_rpm if args.max_rpm is not None else profile["max_rpm"]
    backoff_retries = (
        args.backoff_retries if args.backoff_retries is not None else profile["backoff_retries"]
    )
    backoff_initial = (
        args.backoff_initial if args.backoff_initial is not None else profile["backoff_initial"]
    )
    backoff_max = args.backoff_max if args.backoff_max is not None else profile["backoff_max"]
    backoff_factor = (
        args.backoff_factor if args.backoff_factor is not None else profile["backoff_factor"]
    )
    backoff_jitter = (
        args.backoff_jitter if args.backoff_jitter is not None else profile["backoff_jitter"]
    )

    if workers <= 0:
        raise ValueError("--workers must be > 0.")
    if max_rpm is not None and max_rpm < 0:
        raise ValueError("--max-rpm must be >= 0.")
    if backoff_retries < 0:
        raise ValueError("--backoff-retries must be >= 0.")
    if backoff_initial < 0:
        raise ValueError("--backoff-initial must be >= 0.")
    if backoff_max < 0:
        raise ValueError("--backoff-max must be >= 0.")
    if backoff_factor < 1:
        raise ValueError("--backoff-factor must be >= 1.")
    if backoff_jitter < 0:
        raise ValueError("--backoff-jitter must be >= 0.")

    policy = RequestPolicy(
        max_rpm=max_rpm or 0.0,
        backoff_retries=backoff_retries,
        backoff_initial=backoff_initial,
        backoff_max=backoff_max,
        backoff_factor=backoff_factor,
        backoff_jitter=backoff_jitter,
    )
    return workers, policy


def main():
    parser = argparse.ArgumentParser(description="TanyaHukum BPK Crawler")
    parser.add_argument("--proxy",         default=os.getenv("BPK_PROXY"),
                        help="Proxy URL or user:pass@host:port (or set BPK_PROXY env)")
    parser.add_argument("--rate-profile", choices=sorted(RATE_PROFILES.keys()), default="rotating",
                        help="Traffic profile: rotating (high throughput) or local (single-IP tunnel).")
    parser.add_argument("--relevant-only", action="store_true",
                        help="Only TanyaHukum-relevant subjects (recommended)")
    parser.add_argument("--tema",          help="Single tema ID (e.g. --tema 46)")
    parser.add_argument("--stats",         action="store_true",
                        help="Show stats without crawling")
    parser.add_argument("--workers",       type=int, default=None,
                        help="Concurrent workers (default follows --rate-profile).")
    parser.add_argument("--max-rpm",       type=float, default=None,
                        help="Global request cap per minute across all workers (0 disables cap).")
    parser.add_argument("--backoff-retries", type=int, default=None,
                        help="Retry attempts on 429/transient failures (default follows profile).")
    parser.add_argument("--backoff-initial", type=float, default=None,
                        help="Initial backoff seconds for first retry.")
    parser.add_argument("--backoff-max",   type=float, default=None,
                        help="Max backoff seconds.")
    parser.add_argument("--backoff-factor", type=float, default=None,
                        help="Exponential backoff factor (>= 1).")
    parser.add_argument("--backoff-jitter", type=float, default=None,
                        help="Random jitter seconds added to each backoff.")
    args = parser.parse_args()

    if args.stats:
        print_stats()
        return

    if not args.proxy:
        console.print("[red]Error: --proxy required or set BPK_PROXY env var[/red]")
        console.print("[dim]Format: user:pass@host:port[/dim]")
        return

    try:
        workers, policy = _resolve_runtime_config(args)
    except ValueError as e:
        console.print(f"[red]Error: {e}[/red]")
        return

    session  = make_session(args.proxy)
    progress = load_progress()
    meta     = load_meta()
    proxy_view = normalize_proxy(args.proxy) or "(none)"
    rpm_view = f"{policy.max_rpm:.1f}" if policy.max_rpm > 0 else "unlimited"
    console.print(
        "[dim]"
        f"Runtime config → profile={args.rate_profile}, workers={workers}, max_rpm={rpm_view}, "
        f"backoff_retries={policy.backoff_retries}, proxy={proxy_view}"
        "[/dim]"
    )

    if progress["completed_temas"]:
        console.print(f"[yellow]Resuming. {len(progress['completed_temas'])} temas done.[/yellow]")

    if args.tema:
        topics = {args.tema: {"name": f"Tema {args.tema}", "count": "?"}}

    elif args.relevant_only:
        topics = {tid: {"name": name, "count": "?"} for tid, name in RELEVANT_TOPICS.items()}
        console.print(f"[bold]Crawling {len(topics)} relevant subjects[/bold]")

    else:
        topics = discover_topics(session, policy)
        total  = sum(t.get("count", 0) for t in topics.values() if isinstance(t.get("count"), int))
        console.print(f"[bold]Full crawl: {len(topics)} subjects, ~{total:,} regulations[/bold]")
        console.print("[yellow]This will take many hours. --relevant-only is much faster.[/yellow]")
        if input("Continue? (y/N): ").lower() != "y":
            return

    for tema_id, info in topics.items():
        if tema_id in progress["completed_temas"] and not args.tema:
            console.print(f"  ⏭  tema={tema_id} already done", style="dim")
            continue
        crawl_tema(session, tema_id, info["name"], progress, meta, policy, workers)

    console.rule("COMPLETE")
    print_stats()
    console.print("  Next → [cyan]python scripts/ingest.py[/cyan]")


if __name__ == "__main__":
    main()
