# Copilot Instructions — TanyaHukum

## ⚠️ Critical Rules

- **NEVER overwrite or delete existing files** unless the user explicitly says to delete/overwrite that specific file by name.
- When asked to "make a copy" or "make a new version", create a **new file** and leave the original untouched.
- When in doubt, **ask** before modifying existing files.

## What is TanyaHukum?

**TanyaHukum is an AI-powered legal contract analyzer for Indonesians.** Hackathon project (PIDI-DIGDAYA X Bank Indonesia, deadline March 27 2026) helping everyday people understand contracts before signing.

### User Flow
1. Upload a contract (PDF) at `/cek-dokumen/`
2. AI analyzes every clause — flags risky ones (🔴 BERBAHAYA / 🟡 PERHATIAN / 🟢 AMAN) with Indonesian legal citations
3. Chat with AI — follow-up questions grounded in real Indonesian law via RAG
4. Book a real lawyer — human consultation for complex cases

### Tech Stack
- **Frontend**: Next.js 15 + React 19 + Tailwind CSS 4 — self-hosted (NOT Vercel)
- **Backend**: FastAPI (Python 3.12) — separate service on port 8000
- **Database**: MongoDB Atlas (vector search, `legal_chunks` collection, 121K+ chunks)
- **LLM**: Claude Sonnet 4.6 (`anthropic-claude-4.6-sonnet`) via DigitalOcean Gradient AI — OpenAI-compatible endpoint at `https://inference.do-ai.run/v1`
- **Embeddings**: Mistral `mistral-embed` (1024 dimensions)
- **PDF Parsing**: pdfplumber (Python) for both user uploads and regulation ingestion
- **Crawler**: Python (requests + BeautifulSoup) with rotating Indonesian proxy

---

## Build & Run Commands

### Frontend (web/)
```bash
cd web
npm run dev          # dev server (port 3010)
npm run build        # production build
npm run lint         # ESLint
```

### Backend (api/)
```bash
# Start FastAPI
python3 -m uvicorn api.main:app --host 0.0.0.0 --port 8000

# Health check
curl http://localhost:8000/api/health
```

### Data Pipeline (scripts/)
```bash
# Crawl regulations from BPK
python3 scripts/crawl_bpk_v2.py --relevant-only --workers 10 --proxy user:pass@host:port

# View crawl stats
python3 scripts/crawl_bpk_v2.py --stats

# Ingest PDFs → chunk → embed → MongoDB
python3 scripts/ingest.py              # full pipeline
python3 scripts/ingest.py --stats      # show stats
python3 scripts/ingest.py --retry-errors
```

---

## Architecture

```
User uploads PDF
    ↓
[Next.js :3010] → API proxy rewrites /api/* → http://localhost:8000/api/*
    ↓
[FastAPI :8000]
    ├→ pdfplumber: extract text
    ├→ clause_splitter: regex split by Pasal/BAB/numbered sections
    ├→ Mistral API: embed clauses (1024-dim vectors)
    ├→ MongoDB Atlas: $vectorSearch in legal_chunks (121K+ chunks)
    ├→ Claude Sonnet 4.6 (via DO Gradient): analyze risk per clause
    └→ guardrails: input validation, citation grounding, topic enforcement
    ↓
[AnalysisResponse JSON] → risk scores, issues, recommendations, regulation refs
    ↓
[Next.js] renders results, enables follow-up chat
```

### API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/analyze` | Upload PDF → full contract analysis |
| POST | `/api/chat` | Follow-up Q&A with legal context |
| GET | `/api/health` | Service health + MongoDB/LLM status |

### Risk Levels
| Level | Color | Score Range |
|-------|-------|-------------|
| `high` | 🔴 BERBAHAYA | 7-10 |
| `medium` | 🟡 PERHATIAN | 4-6 |
| `low` | 🟢 AMAN | 1-3 |
| `safe` | ✅ AMAN | 0 |

---

## Frontend Conventions (web/)

### Routing
- All URLs **must end with trailing slash** (`trailingSlash: true` in next.config.mjs)
- App Router with `(pages)` route group for page layouts
- Landing page: `/` — composed of 12 section components from `components/landing/`
- MVP page: `/cek-dokumen/` — single page with 3 states (upload → analyzing → results)

### Content-Driven Components
- **All landing page text lives in `src/lib/constants.ts`** — components consume data, never hardcode copy
- Data structures: `NAV_LINKS`, `FEATURES`, `HOW_IT_WORKS_STEPS`, `PRICING_PLANS`, `FAQ_ITEMS`, `COMPLIANCE_ITEMS`, `TRUST_PARTNERS`, `FOOTER_SECTIONS`

### Styling
- Tailwind CSS 4 with custom theme in `globals.css`
- Brand colors: `primary-orange` (#FF6B35), `dark-navy` (#1A2332), `light-cream` (#FFF5F0), `amber` (#FFB84D)
- Fonts: DM Sans (body), Sora (headings) — loaded via Google Fonts in layout.tsx
- Path alias: `@/*` → `./src/*`

### Component Organization
- `components/ui/` — shared primitives (Button, SectionHeading) with barrel export
- `components/landing/` — 12 landing page sections with barrel export
- `components/cek-dokumen/` — 5 MVP feature components with barrel export
- Button component has variants: `primary`, `secondary`, `outline`, `dark` and sizes: `sm`, `md`, `lg`
- **No icons in buttons** on the cek-dokumen page

### Section IDs (for anchor nav)
`id="home"` (Hero), `id="features"` (Features), `id="pricing"` (CTAPricing), `id="faq"` (FAQ)

---

## Backend Conventions (api/)

### Service Layer Pattern
Each concern is a separate service in `api/services/`:
- `pdf_extractor.py` — pdfplumber text extraction with `[Halaman N]` page markers
- `clause_splitter.py` — regex cascade: Pasal → BAB → numbered → paragraph fallback
- `embeddings.py` — Mistral embed with text sanitization + batch support
- `rag.py` — MongoDB `$vectorSearch` (index: `vector_index`, path: `embedding`, numCandidates: top_k * 10)
- `analyzer.py` — orchestrator: clauses → embed → RAG → Claude → structured JSON response
- `guardrails.py` — PDF magic byte validation, text length check, citation grounding, chat topic keyword filter

### LLM Integration
- Uses `openai` Python SDK with `base_url` pointed at DO Gradient
- Model: `anthropic-claude-4.6-sonnet`
- Auth: Bearer token via `DO_MODEL_ACCESS_KEY`
- Analysis prompts return structured JSON; chat uses `CHAT_SYSTEM_PROMPT` with strict topic enforcement

### Config
- `api/config.py` uses Pydantic Settings with `extra = "ignore"` (needed because .env has unrelated vars)
- All secrets in root `.env` file

---

## Crawler Conventions (scripts/)

- **crawl_bpk_v2.py** is the active crawler (v1 is legacy Firecrawl-based)
- Proxy required: BPK (`peraturan.bpk.go.id`) blocks non-Indonesian IPs via Cloudflare
- Set proxy via `--proxy` flag or `BPK_PROXY` env var
- **"Berlaku" = active, "Dicabut" = revoked** — only active regulations get downloaded
- Resume is always on — `processed_ids` tracked as set in `data/crawl_progress.json`
- 17 metadata fields extracted per regulation, saved to `data/regulations_meta.json`
- `RELEVANT_TOPICS` dict defines 16 legal subjects relevant to TanyaHukum

### Data Files (gitignored)
- `data/regulations/*.pdf` — downloaded regulation PDFs (~8.6 GB)
- `data/crawl_progress.json` — crawler resume state
- `data/regulations_meta.json` — metadata for all regulations
- `data/ingest_state.json` — ingestion pipeline progress

---

## PM2 Process Management

Both services are managed via PM2 with auto-restart. Config file: `ecosystem.config.cjs`.

| PM2 Name | Service | Port |
|----------|---------|------|
| `th-api` | FastAPI backend | 8000 |
| `th-web` | Next.js dev server | 3010 |

### Common Commands
```bash
pm2 status                    # list all processes
pm2 logs th-api --lines 50    # view API logs
pm2 logs th-web --lines 50    # view web logs
pm2 restart th-api            # restart API
pm2 restart th-web            # restart web
pm2 restart all               # restart everything

# Start from ecosystem file (if processes are deleted)
cd /root/tanyahukum && pm2 start ecosystem.config.cjs

# Save process list (persists across server reboots)
pm2 save --force
```

### After Server Reboot
PM2 is configured with `pm2 startup` so saved processes auto-start on boot. If not, run:
```bash
cd /root/tanyahukum && pm2 start ecosystem.config.cjs && pm2 save --force
```

---

## Agent Behavior: Post-Change Server Management

**After EVERY code change, the agent MUST evaluate whether the change requires a server rebuild or restart.**

### Decision Matrix

| Change Type | Action Required |
|-------------|----------------|
| `web/src/` files (components, pages, lib) | **Build + Restart**: `cd web && npm run build && pm2 restart th-web` — We run `next start` (production), NOT `next dev`. There is NO hot-reload. |
| `web/next.config.mjs`, `web/package.json` | **Build + Restart**: `cd web && npm run build && pm2 restart th-web` |
| `web/src/app/api/` route files added/deleted | **Build + Restart**: `cd web && npm run build && pm2 restart th-web` |
| `api/` Python files (services, routers, models) | **Restart**: `pm2 restart th-api` (uvicorn doesn't hot-reload in production mode) |
| `api/requirements.txt` | **Install + restart**: `pip install -r api/requirements.txt && pm2 restart th-api` |
| `.env` changes | **Restart both**: `pm2 restart th-api th-web` |
| `ecosystem.config.cjs` | **Restart all**: `pm2 restart th-api th-web` |
| Static files (`web/public/`) | **None** — served directly |
| `scripts/` Python files | **None** — run manually, not managed by PM2 |

### Rule
**We are running PRODUCTION (`next start`), NOT dev (`next dev`).** There is NO hot-reload. Every frontend change requires `npm run build` before `pm2 restart th-web`.

Do NOT assume changes are live. Always build and restart. Verify the service is responding after restart:
```bash
cd /root/tanyahukum/web && npm run build && pm2 restart th-web && sleep 5 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3010/
pm2 restart th-api && sleep 3 && curl -s http://localhost:8000/api/health
```

---

## Agent Behavior: Commit & Push After Every Change

**After EVERY code change — no matter how small — the agent MUST commit and push to GitHub.**

### Rules
1. **Commit immediately** after each logical change (bug fix, feature, config update, docs edit).
2. Use **conventional commit messages** (e.g., `fix:`, `feat:`, `docs:`, `chore:`, `refactor:`).
3. Always include the Co-authored-by trailer:
   ```
   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
   ```
4. **Push to `origin main`** right after committing.
5. If push fails due to auth, ask the user for the PAT token.
6. Do NOT batch multiple unrelated changes into one commit — keep commits atomic and descriptive.

### Example Flow
```bash
cd /root/tanyahukum
git add -A
git commit -m "fix: center chat disclaimer text in ChatPanel

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push origin main
```
