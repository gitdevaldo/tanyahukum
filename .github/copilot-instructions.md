# GitHub Copilot Instructions — TanyaHukum

Use this file to keep generated code aligned with the real patterns in this repository.

## 1) Priority Rules

1. Match existing patterns in nearby files before introducing new abstractions.
2. Respect exact framework/runtime versions from lockfiles and requirements.
3. Preserve the current architecture: Next.js (BFF/proxy) + FastAPI services.
4. Keep Indonesian product copy and legal terminology consistent.
5. Avoid silent fallbacks in signing and document status flows.

## 2) Verified Stack (from repository)

- Frontend: Next.js 15 (`web/`), React 19, TypeScript, Tailwind CSS.
- Backend: FastAPI (`api/`), Python 3.12 style, Pydantic models, slowapi rate limiting.
- Storage and data:
  - Qdrant collections for legal chunks and analysis payload/PDF blobs.
  - Supabase Postgres tables for users/documents/signers/signatures/events.
  - Signed PDF version table: `document_pdf_versions`.
- Process manager: PM2 via `ecosystem.config.cjs`.

## 3) Build, Lint, and Verification Commands

Run from repository root unless stated otherwise.

### Frontend (`web/`)

- `cd web && npm run dev` (local dev server)
- `cd web && npm run lint` (repo lint)
- `cd web && npm run lint -- --file src/app/dashboard/page.tsx` (single-file lint)
- `cd web && npm run build` (production build)

### Backend (`api/`)

- `python3 -m uvicorn api.main:app --host 0.0.0.0 --port 8000`
- `curl -s http://localhost:8000/api/health`
- `python3 -m py_compile api/routers/documents.py` (single-file syntax check)

### Testing Notes

- There is currently no committed, standard repo-wide unit test suite command (for example, no `npm test` or `pytest` workflow in project scripts).
- Use targeted smoke checks for changed behavior (especially signing routes and dashboard flows).

## 4) Production Runtime Rules

- This project runs in production mode with PM2.
- Frontend is not hot-reloaded in production mode.
- After frontend changes (`web/src`, `next.config`, route handlers), rebuild and restart:
  - `cd web && npm run build && pm2 restart th-web`
- After backend Python changes (`api/`), restart:
  - `pm2 restart th-api`
- After `.env` changes, restart both services.

## 5) Architecture and Boundaries

### Frontend/API boundary

- Next.js route handlers in `web/src/app/api/**` act as a BFF/proxy to FastAPI (`http://localhost:8000/api/...`).
- Document proxy is strict allowlist-based at:
  - `web/src/app/api/documents/[...segments]/route.ts`
- If adding document endpoints, update allowlist helpers (`isAllowedGetRoute`, `isAllowedPostRoute`, and PDF route checks) to avoid 400/401 regressions.

### Backend layering

- Routers in `api/routers/*.py` should stay thin.
- Domain logic belongs in `api/services/*.py` (especially `documents.py`, `signing_pdf.py`, `supabase_auth.py`).
- Keep auth/profile/quota resolution centralized in service helpers.

### Data flow (contract analysis)

1. Upload PDF via `/api/analyze`.
2. Extract/split/embed and run legal analysis.
3. Persist analysis payload and original PDF.
4. Link analysis to document records for signing workflows.

### Data flow (visual signing)

1. Sign page loads PDF (for signed/completed docs, prefer `/signed-pdf/` view path).
2. User drops/moves/resizes signature placement on rendered pages.
3. Finalize endpoint validates placement payload and applies visual stamp.
4. Signed output is saved as a new version (`document_pdf_versions`) instead of mutating original bytes.

## 6) Critical Conventions

### Routing and auth

- `next.config.mjs` uses `trailingSlash: true`; keep generated links and fetch paths consistent.
- Preserve `Authorization` forwarding in proxy handlers.
- For document and certificate PDF routes, treat auth as required.

### Status and event semantics

- Respect existing document status transitions:
  - `draft`, `analyzed`, `pending_signatures`, `partially_signed`, `completed`, `expired`, `rejected`.
- Do not invent new `document_events.event_type` values unless DB constraints are updated in schema bootstrap/migrations.

### Signing correctness

- Do not mark a document as signed/completed unless a valid signing operation actually occurred.
- Keep signed users read-only for re-opened signing views.
- Preserve signed output retrieval via signed-version-first logic.

### UI conventions

- Keep button labels text-only (no icons/emoji in buttons).
- Keep chatbot copy plain text (no emoji/icons).
- Keep Indonesian UX wording consistent with existing pages/components.

## 7) File Map for Similarity Search

Check these files first when adding/changing behavior:

- `web/src/app/dashboard/page.tsx` — dashboard document center logic.
- `web/src/app/dashboard/sign/[documentId]/page.tsx` — visual signing editor.
- `web/src/app/api/documents/[...segments]/route.ts` — document proxy allowlist.
- `api/routers/documents.py` — signing/document endpoints.
- `api/services/documents.py` — document status + signer flow.
- `api/services/signing_pdf.py` — PDF stamping/placement logic.
- `api/services/supabase_auth.py` — schema bootstrap and constraints.
- `api/routers/analyze.py` + `api/services/analyzer.py` — analysis flow.

## 8) Copilot Output Expectations

When generating code for this repo:

- Prefer incremental edits over broad rewrites.
- Keep API contracts and response shapes stable.
- Surface errors explicitly (no broad catch-and-ignore behavior).
- If adding a new endpoint/feature, wire both frontend proxy and backend route/service layers.
- Include minimal, focused verification steps for changed areas.
