"""
TanyaHukum - BPK Automatic Crawler
=====================================
Fully automatic. Zero manual input. Based on REAL page structure.

DISCOVERED PAGE STRUCTURE:
  /Subjek       → "SubjectName\n\n[COUNT](?tema=ID)" per subject
  /Search?tema=X&p=N → regulations listed with:
                       - "• Berlaku mulai X tahun yang lalu" = ACTIVE ✅
                       - "Dicabut dengan" section = DEAD ❌
                       - "[filename.pdf](.../Download/ID/...pdf)" = direct PDF URL
                       - Pagination: [Last](?tema=X&p=LAST_PAGE_NUM)
  /Details/ID   → fallback only: "Status\n\nBerlaku" + "[Download](url)"

FLOW:
  1. Scrape /Subjek          → get all {tema_id: name, count}
  2. For each tema:
       a. Fetch page 1        → grab LAST page number from pagination
       b. Fetch pages 1..N    → extract status + PDF url per regulation
       c. "Berlaku"           → download PDF directly ✅
       d. "Dicabut"           → skip ❌
       e. Ambiguous           → fetch /Details page to confirm
  3. Save progress every 50 regs → safe to CTRL+C and --resume

USAGE:
  pip install firecrawl-py requests rich

  python scripts/crawl_bpk.py --relevant-only --api-key YOUR_KEY
  python scripts/crawl_bpk.py --tema 46 --api-key YOUR_KEY
  python scripts/crawl_bpk.py --api-key YOUR_KEY              # full crawl
  python scripts/crawl_bpk.py --relevant-only --resume --api-key YOUR_KEY
  python scripts/crawl_bpk.py --stats

OUTPUT:
  data/regulations/           <- PDFs (Berlaku only)
  data/crawl_progress.json    <- resume state
  data/regulations_meta.json  <- metadata for every regulation seen
"""

import os
import re
import json
import time
import argparse
import requests
from pathlib import Path
from datetime import datetime

try:
    from firecrawl import FirecrawlApp
except ImportError:
    print("ERROR: pip install firecrawl-py")
    exit(1)

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

DELAY_PAGES         = 1.5   # seconds between search pages
DELAY_DETAILS       = 1.0   # seconds between details fetches
SAVE_EVERY          = 50    # save progress every N regulations

# ── TanyaHukum relevant subjects (from real /Subjek page) ─────────
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
# STATE / PROGRESS
# ================================================================

def load_progress() -> dict:
    if PROGRESS_F.exists():
        with open(PROGRESS_F) as f:
            return json.load(f)
    return {
        "completed_temas": [],
        "processed_ids": [],
        "total_downloaded": 0,
        "total_skipped": 0,
        "last_updated": None,
    }

def save_progress(p: dict):
    p["last_updated"] = datetime.now().isoformat()
    with open(PROGRESS_F, "w") as f:
        json.dump(p, f, indent=2)

def load_meta() -> dict:
    if META_F.exists():
        with open(META_F) as f:
            data = json.load(f)
            return {r["id"]: r for r in data if r.get("id")}
    return {}

def save_meta(meta: dict):
    with open(META_F, "w") as f:
        json.dump(list(meta.values()), f, ensure_ascii=False, indent=2)


# ================================================================
# STEP 1: /Subjek -> all tema IDs
# Real structure: "SubjectName\n\n\n[7628](https://...?tema=1)"
# ================================================================

def discover_topics(app: FirecrawlApp) -> dict:
    """Returns {tema_id: {"name": str, "count": int}}"""
    console.print("\n[bold blue]Step 1: Discovering subjects from /Subjek...[/bold blue]")

    r  = app.scrape_url(f"{BASE_URL}/Subjek", params={"formats": ["markdown"]})
    md = r.get("markdown", "")

    pattern = re.compile(
        r'([A-Za-z][^\n\[\]]{2,100}?)\s*\n+\s*\[(\d[\d,]*)\]\(https://peraturan\.bpk\.go\.id/Search\?tema=(\d+)\)'
    )

    topics = {}
    for m in pattern.finditer(md):
        name  = m.group(1).strip()
        count = int(m.group(2).replace(",", ""))
        tid   = m.group(3)
        topics[tid] = {"name": name, "count": count}

    console.print(f"  Found [green]{len(topics)}[/green] subjects")
    return topics


# ================================================================
# STEP 2: /Search?tema=X&p=N -> regulation list
#
# Real structure per card (from actual markdown):
#
#   "Undang-undang (UU) No. 30 Tahun 2014
#
#    • Berlaku mulai 11 tahun yang lalu
#
#    [Administrasi Pemerintahan](https://...Details/38695/uu-no-30-tahun-2014)
#
#    Abstrak
#    Administrasi dan Tata Usaha Negara
#    Status Peraturan
#    Diubah dengan
#    1. [UU No. 6 Tahun 2023](...) tentang ...
#
#    Download file:
#    [UU Nomor 30 Tahun 2014.pdf](https://...bpk.go.id/Download/28023/UU%20Nomor%2030.pdf)"
#
# Dead regulation example:
#   "• Berlaku mulai 18 tahun yang lalu
#    [Title](Details/...)
#    Status Peraturan
#    Dicabut dengan
#    1. [UU No. X ...](...)"
#
# Pagination: "[Last](https://peraturan.bpk.go.id/Search?tema=1&p=763)"
# ================================================================

def get_last_page(md: str, tema_id: str) -> int:
    """Extract last page number from pagination."""
    m = re.search(
        rf'\[Last\]\(https://peraturan\.bpk\.go\.id/Search\?tema={tema_id}&p=(\d+)\)',
        md
    )
    return int(m.group(1)) if m else 1


def parse_search_page(md: str, tema_id: str, tema_name: str) -> list[dict]:
    """
    Parse one search page. Returns regulation dicts with status + download URL.
    
    Strategy: split markdown into regulation "cards" using the bullet point
    "• Berlaku mulai" as a card boundary marker, since every regulation
    card on BPK starts with this line (even ones that get later Dicabut).
    """
    results = []

    # Split into cards at each regulation entry
    # Markers: the "• Berlaku" line or numbered regulation header
    # We use Details links as anchors since each card has exactly one main Details link

    # Find all main Details links (regulation titles, not cross-references)
    # Cross-references appear in "Diubah dengan:", "Mengubah:", "Mencabut:" sections
    # Main links appear right after "• Berlaku mulai"

    # Pattern: "• Berlaku mulai ... \n\n [Title](Details/ID/slug)"
    card_pattern = re.compile(
        r'•\s*Berlaku mulai[^\n]*\n+'            # status line
        r'\s*\[([^\]]+)\]'                        # title
        r'\((https://peraturan\.bpk\.go\.id/Details/(\d+)/[^\)]+)\)',  # detail URL
        re.DOTALL
    )

    for card_m in card_pattern.finditer(md):
        title      = card_m.group(1).strip()
        detail_url = card_m.group(2)
        doc_id     = card_m.group(3)

        # Get card content: from this match to next card start
        card_start = card_m.start()
        next_card  = md.find("• Berlaku mulai", card_m.end())
        card_end   = next_card if next_card != -1 else len(md)
        card_text  = md[card_start:card_end]

        # ── Status: check for "Dicabut dengan" in this card ────────
        is_dicabut = bool(re.search(r'Dicabut dengan', card_text))
        is_berlaku = not is_dicabut  # default: if not dicabut, it's berlaku

        # ── Download URL ────────────────────────────────────────────
        # Real pattern: "[filename.pdf](https://...bpk.go.id/Download/ID/file.pdf)"
        dl_match = re.search(
            r'\[([^\]]+\.pdf)\]\((https://peraturan\.bpk\.go\.id/Download/\d+/[^\)]+)\)',
            card_text, re.IGNORECASE
        )
        download_url = dl_match.group(2) if dl_match else None

        # ── "Diubah dengan" — still Berlaku, note the amendments ───
        amended_by = re.findall(
            r'Diubah dengan.*?\n.*?\[([^\]]+)\]\((https://peraturan\.bpk\.go\.id/Details/[^\)]+)\)',
            card_text, re.DOTALL
        )

        results.append({
            "id":                 doc_id,
            "title":              title,
            "detail_url":         detail_url,
            "tema_id":            tema_id,
            "tema_name":          tema_name,
            "status_raw":         "Dicabut" if is_dicabut else "Berlaku",
            "is_berlaku":         is_berlaku,
            "download_url":       download_url,
            "amended_by":         [{"title": t, "url": u} for t, u in amended_by],
            # Need details check only if no download URL found on search page
            "needs_detail_check": is_berlaku and download_url is None,
        })

    return results


# ================================================================
# STEP 3 (FALLBACK): /Details/ID
# Used when search page has no download URL (rare edge case).
# Real structure:
#   "Status\n\nBerlaku"
#   "[Download](https://peraturan.bpk.go.id/Download/27832/file.pdf)"
# ================================================================

def parse_details_page(md: str) -> dict:
    """Parse Details page for status + download URL."""
    result = {"status": "UNKNOWN", "is_berlaku": False, "download_url": None}

    m = re.search(r'Status\s*\n+\s*([^\n]+)', md)
    if m:
        raw = m.group(1).strip()
        result["status"]     = raw
        result["is_berlaku"] = raw.lower() == "berlaku"

    m = re.search(
        r'\[Download\]\((https://peraturan\.bpk\.go\.id/Download/[^\)]+)\)',
        md, re.IGNORECASE
    )
    if m:
        result["download_url"] = m.group(1)

    return result


# ================================================================
# STEP 4: DOWNLOAD PDF
# ================================================================

def download_pdf(url: str, reg: dict) -> bool:
    """Download PDF to data/regulations/. Returns True on success."""
    safe     = re.sub(r'[^\w\-]', '_', reg.get("id", "0"))
    filepath = OUT_DIR / f"{reg['id']}_{safe[:40]}.pdf"

    if filepath.exists() and filepath.stat().st_size > 10_000:
        reg["local_path"] = str(filepath)
        reg["downloaded"] = True
        return True

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer":    BASE_URL,
        }
        r = requests.get(url, headers=headers, timeout=30, stream=True)
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

def crawl_tema(app: FirecrawlApp, tema_id: str, tema_name: str,
               progress: dict, meta: dict):

    console.print(f"\n[bold]📂 tema={tema_id}: {tema_name}[/bold]")

    # Page 1: get total pages
    url_p1 = f"{BASE_URL}/Search?tema={tema_id}&p=1"
    r1     = app.scrape_url(url_p1, params={"formats": ["markdown"]})
    md1    = r1.get("markdown", "")

    last_page = get_last_page(md1, tema_id)
    console.print(f"  Total pages: [bold]{last_page}[/bold]")

    all_regs = parse_search_page(md1, tema_id, tema_name)

    # Remaining pages
    for page in range(2, last_page + 1):
        console.print(f"  📄 Fetching page {page}/{last_page}...", end=" ")
        try:
            r   = app.scrape_url(
                    f"{BASE_URL}/Search?tema={tema_id}&p={page}",
                    params={"formats": ["markdown"]}
                  )
            md  = r.get("markdown", "")
            new = parse_search_page(md, tema_id, tema_name)
            all_regs.extend(new)
            console.print(f"[dim]+{len(new)}[/dim]")
        except KeyboardInterrupt:
            raise
        except Exception as e:
            console.print(f"[red]error: {e}[/red]")
        time.sleep(DELAY_PAGES)

    # Deduplicate
    seen     = set()
    unique   = []
    for r in all_regs:
        if r["id"] not in seen:
            seen.add(r["id"])
            unique.append(r)

    console.print(f"  Unique regulations: [bold]{len(unique)}[/bold]")

    # Process each
    downloaded = skipped = errors = 0

    for reg in unique:
        doc_id = reg["id"]

        if doc_id in progress["processed_ids"]:
            continue

        try:
            # Fallback: fetch Details page if no PDF URL found
            if reg.get("needs_detail_check"):
                console.print(f"  🔍 Checking details: {reg['title'][:50]}...", end=" ")
                dr    = app.scrape_url(reg["detail_url"], params={"formats": ["markdown"]})
                dinfo = parse_details_page(dr.get("markdown", ""))
                reg.update(dinfo)
                console.print(f"[dim]{dinfo.get('status','?')}[/dim]")
                time.sleep(DELAY_DETAILS)

            if reg.get("is_berlaku"):
                dl_url = reg.get("download_url")
                if dl_url:
                    ok = download_pdf(dl_url, reg)
                    if ok:
                        downloaded += 1
                        console.print(
                            f"  ✅ [green]{reg['title'][:70]}[/green]"
                            f" ({reg.get('size_kb','?')}KB)"
                        )
                    else:
                        errors += 1
                        console.print(f"  ⚠  PDF failed: {reg['title'][:60]}", style="yellow")
                else:
                    errors += 1
                    console.print(f"  ⚠  No PDF URL: {reg['title'][:60]}", style="yellow")
            else:
                skipped += 1
                console.print(f"  ❌ [red]{reg.get('status_raw','Dicabut')}[/red] — {reg['title'][:65]}")

            reg["scraped_at"] = datetime.now().isoformat()
            meta[doc_id] = reg
            progress["processed_ids"].append(doc_id)

            n = len(progress["processed_ids"])
            if n % SAVE_EVERY == 0:
                save_progress(progress)
                save_meta(meta)
                console.print(f"  💾 [dim]Saved ({n} total processed)[/dim]")

        except KeyboardInterrupt:
            console.print("\n\n[yellow]Interrupted. Saving...[/yellow]")
            save_progress(progress)
            save_meta(meta)
            console.print("[green]Saved. Resume with --resume.[/green]")
            raise SystemExit(0)

        except Exception as e:
            errors += 1
            console.print(f"  [red]Error ({doc_id}): {str(e)[:80]}[/red]")

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
    dl       = [r for r in meta.values() if r.get("downloaded")]
    dead     = [r for r in meta.values() if not r.get("is_berlaku")]

    console.rule("TanyaHukum Crawl Stats")
    console.print(f"  Regulations seen   : {len(meta)}")
    console.print(f"  PDFs downloaded    : [green]{len(dl)}[/green]")
    console.print(f"  Dead (skipped)     : [red]{len(dead)}[/red]")
    console.print(f"  Temas completed    : {len(progress['completed_temas'])}")
    console.print(f"  Last updated       : {progress.get('last_updated','never')}")
    if dl:
        total_mb = sum(r.get("size_kb", 0) for r in dl) / 1024
        console.print(f"  Total PDF size     : {total_mb:.1f} MB")


# ================================================================
# CLI
# ================================================================

def main():
    parser = argparse.ArgumentParser(description="TanyaHukum BPK Crawler")
    parser.add_argument("--api-key",       default=os.getenv("FIRECRAWL_API_KEY"),
                        help="Firecrawl API key")
    parser.add_argument("--relevant-only", action="store_true",
                        help="Only TanyaHukum-relevant subjects (recommended)")
    parser.add_argument("--tema",          help="Single tema ID (e.g. --tema 46)")
    parser.add_argument("--resume",        action="store_true",
                        help="Resume interrupted crawl")
    parser.add_argument("--stats",         action="store_true",
                        help="Show stats without crawling")
    args = parser.parse_args()

    if args.stats:
        print_stats()
        return

    if not args.api_key:
        console.print("[red]Error: --api-key required or set FIRECRAWL_API_KEY[/red]")
        return

    app      = FirecrawlApp(api_key=args.api_key)
    progress = load_progress()
    meta     = load_meta()

    if args.resume:
        console.print(f"[yellow]Resuming. {len(progress['completed_temas'])} temas done.[/yellow]")

    if args.tema:
        topics = {args.tema: {"name": f"Tema {args.tema}", "count": "?"}}

    elif args.relevant_only:
        topics = {tid: {"name": name, "count": "?"} for tid, name in RELEVANT_TOPICS.items()}
        console.print(f"[bold]Crawling {len(topics)} relevant subjects[/bold]")

    else:
        topics = discover_topics(app)
        total  = sum(t.get("count", 0) for t in topics.values() if isinstance(t.get("count"), int))
        console.print(f"[bold]Full crawl: {len(topics)} subjects, ~{total:,} regulations[/bold]")
        console.print("[yellow]This will take many hours. --relevant-only is much faster.[/yellow]")
        if input("Continue? (y/N): ").lower() != "y":
            return

    for tema_id, info in topics.items():
        if tema_id in progress["completed_temas"] and not args.tema:
            console.print(f"  ⏭  tema={tema_id} already done", style="dim")
            continue
        crawl_tema(app, tema_id, info["name"], progress, meta)
        time.sleep(2)

    console.rule("COMPLETE")
    print_stats()
    console.print("  Next → [cyan]python scripts/ingest.py[/cyan]")


if __name__ == "__main__":
    main()
