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

  python3 crawl_bpk.py --relevant-only --proxy user:pass@host:port
  python3 crawl_bpk.py --tema 46 --proxy user:pass@host:port
  python3 crawl_bpk.py --proxy user:pass@host:port            # full crawl
  python3 crawl_bpk.py --stats

OUTPUT:
  data/regulations/           <- PDFs (Berlaku only)
  data/crawl_progress.json    <- resume state
  data/regulations_meta.json  <- metadata for downloaded regulations
"""

import os
import re
import json
import argparse
import threading
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

def make_session(proxy_str: str | None) -> requests.Session:
    """Create a requests session with optional proxy."""
    s = requests.Session()
    s.headers.update(HEADERS)
    if proxy_str:
        proxy_url = f"http://{proxy_str}"
        s.proxies = {"http": proxy_url, "https": proxy_url}
    return s


def fetch_html(session: requests.Session, url: str) -> BeautifulSoup:
    """Fetch a URL and return parsed BeautifulSoup."""
    r = session.get(url, timeout=30)
    r.raise_for_status()
    return BeautifulSoup(r.text, "html.parser")


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
        with open(PROGRESS_F, "w") as f:
            json.dump(serializable, f, indent=2)

def load_meta() -> dict:
    if META_F.exists():
        with open(META_F) as f:
            data = json.load(f)
            return {r["id"]: r for r in data if r.get("id")}
    return {}

def save_meta(meta: dict):
    with _save_lock:
        with open(META_F, "w") as f:
            json.dump(list(meta.values()), f, ensure_ascii=False, indent=2)


# ================================================================
# STEP 1: /Subjek -> all tema IDs
#
# HTML structure:
#   <div class="my-6 d-flex justify-content-between ...">
#     <div class="fw-bold pe-4">Subject Name</div>
#     <div><a class="btn ..." href="/Search?tema=ID">COUNT</a></div>
#   </div>
# ================================================================

def discover_topics(session: requests.Session) -> dict:
    """Returns {tema_id: {"name": str, "count": int}}"""
    console.print("\n[bold blue]Step 1: Discovering subjects from /Subjek...[/bold blue]")

    soup = fetch_html(session, f"{BASE_URL}/Subjek")
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

def download_pdf(session: requests.Session, url: str, reg: dict) -> bool:
    """Download PDF to data/regulations/. Returns True on success."""
    safe     = re.sub(r'[^\w\-]', '_', reg.get("title", "unknown"))
    filepath = OUT_DIR / f"{reg['id']}_{safe[:40]}.pdf"

    if filepath.exists() and filepath.stat().st_size > 10_000:
        reg["local_path"] = str(filepath)
        reg["downloaded"] = True
        return True

    try:
        r = session.get(url, timeout=30, stream=True)
        r.raise_for_status()

        ct = r.headers.get("content-type", "")
        if "html" in ct and "pdf" not in ct:
            return False

        with open(filepath, "wb") as f:
            for chunk in r.iter_content(8192):
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


# ================================================================
# MAIN CRAWL LOOP
# ================================================================

def _process_one(session: requests.Session, reg: dict,
                 progress: dict, meta: dict) -> str:
    """Worker: fetch Details → download PDF. Returns 'downloaded'|'skipped'|'error'."""
    doc_id = reg["id"]

    if doc_id in progress["processed_ids"]:
        return "already"

    try:
        soup  = fetch_html(session, reg["detail_url"])
        dinfo = parse_details_page(soup)
        reg.update(dinfo)

        if not reg.get("is_berlaku"):
            console.print(f"  ❌ [red]{reg.get('status','Dicabut')}[/red] — {reg['title'][:65]}")
            return "skipped"

        dl_url = reg.get("download_url")
        if not dl_url:
            console.print(f"  ⚠  No PDF URL: {reg['title'][:60]}", style="yellow")
            return "error"

        ok = download_pdf(session, dl_url, reg)
        if ok:
            reg["scraped_at"] = datetime.now().isoformat()
            with _save_lock:
                meta[doc_id] = reg
                progress["processed_ids"].add(doc_id)
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


def crawl_tema(session: requests.Session, tema_id: str, tema_name: str,
               progress: dict, meta: dict, workers: int = 10):

    console.print(f"\n[bold]📂 tema={tema_id}: {tema_name}[/bold]")

    # Page 1: get total pages
    soup1 = fetch_html(session, f"{BASE_URL}/Search?tema={tema_id}&p=1")
    last_page = get_last_page(soup1)
    console.print(f"  Total pages: [bold]{last_page}[/bold]")

    all_regs = parse_search_page(soup1, tema_id, tema_name)

    # Remaining pages
    for page in range(2, last_page + 1):
        console.print(f"  📄 Fetching page {page}/{last_page}...", end=" ")
        try:
            soup = fetch_html(session, f"{BASE_URL}/Search?tema={tema_id}&p={page}")
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
            pool.submit(_process_one, session, reg, progress, meta): reg
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

def main():
    parser = argparse.ArgumentParser(description="TanyaHukum BPK Crawler")
    parser.add_argument("--proxy",         default=os.getenv("BPK_PROXY"),
                        help="Proxy as user:pass@host:port (or set BPK_PROXY env)")
    parser.add_argument("--relevant-only", action="store_true",
                        help="Only TanyaHukum-relevant subjects (recommended)")
    parser.add_argument("--tema",          help="Single tema ID (e.g. --tema 46)")
    parser.add_argument("--stats",         action="store_true",
                        help="Show stats without crawling")
    parser.add_argument("--workers",       type=int, default=10,
                        help="Concurrent download workers (default: 10)")
    args = parser.parse_args()

    if args.stats:
        print_stats()
        return

    if not args.proxy:
        console.print("[red]Error: --proxy required or set BPK_PROXY env var[/red]")
        console.print("[dim]Format: user:pass@host:port[/dim]")
        return

    session  = make_session(args.proxy)
    progress = load_progress()
    meta     = load_meta()

    if progress["completed_temas"]:
        console.print(f"[yellow]Resuming. {len(progress['completed_temas'])} temas done.[/yellow]")

    if args.tema:
        topics = {args.tema: {"name": f"Tema {args.tema}", "count": "?"}}

    elif args.relevant_only:
        topics = {tid: {"name": name, "count": "?"} for tid, name in RELEVANT_TOPICS.items()}
        console.print(f"[bold]Crawling {len(topics)} relevant subjects[/bold]")

    else:
        topics = discover_topics(session)
        total  = sum(t.get("count", 0) for t in topics.values() if isinstance(t.get("count"), int))
        console.print(f"[bold]Full crawl: {len(topics)} subjects, ~{total:,} regulations[/bold]")
        console.print("[yellow]This will take many hours. --relevant-only is much faster.[/yellow]")
        if input("Continue? (y/N): ").lower() != "y":
            return

    for tema_id, info in topics.items():
        if tema_id in progress["completed_temas"] and not args.tema:
            console.print(f"  ⏭  tema={tema_id} already done", style="dim")
            continue
        crawl_tema(session, tema_id, info["name"], progress, meta, args.workers)

    console.rule("COMPLETE")
    print_stats()
    console.print("  Next → [cyan]python scripts/ingest.py[/cyan]")


if __name__ == "__main__":
    main()
