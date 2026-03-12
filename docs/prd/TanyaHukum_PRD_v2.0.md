**TanyaHukum**

AI Legal Document Analysis & Digital Signing Platform

*untuk Indonesia*

**PRODUCT REQUIREMENTS DOCUMENT**

Version 2.0 • March 2026

PIDI-DIGDAYA X Hackathon 2026 • Bank Indonesia

---

**Changelog dari v1.0**

| Area | v1.0 | v2.0 |
|------|------|------|
| Scope | Analisis dokumen saja | Analisis + e-Signature + document sharing |
| Pricing | B2C 3-tier tunggal | Personal (individual) + B2B (perusahaan) terpisah |
| Business Model | Freemium analisis | Dual-product: Analisis quota + e-Sign quota |
| User Flow | Upload → analisis → chat | Upload → analisis → review → tanda tangan digital |
| Architecture | Next.js + FastAPI | + Signing service, notification service, user accounts |
| Competition | vs ChatGPT, LawGeex | vs Privy, Mekari Sign — with AI analysis differentiator |

---

# 1. Product Overview

## 1.1 Executive Summary

TanyaHukum adalah platform analisis dokumen hukum dan tanda tangan digital berbasis AI yang dirancang khusus untuk pasar Indonesia. Platform ini menggabungkan dua kebutuhan yang selama ini terpisah: **memahami isi kontrak** dan **menandatanganinya secara digital** — dalam satu alur yang mulus.

Berbeda dari platform e-signature seperti Privy atau Mekari Sign yang memudahkan penandatanganan tanpa mendorong pengguna membaca isi kontrak, TanyaHukum menempatkan **"pahami dulu, baru tanda tangan"** sebagai prinsip utama.

Pengguna — baik individu maupun perusahaan — cukup mengunggah dokumen, dan dalam waktu sekitar 15 detik TanyaHukum akan: (1) mengekstrak klausa-klausa kunci, (2) memberikan skor risiko per klausa berdasarkan hukum Indonesia yang berlaku, (3) menyediakan chatbot untuk pertanyaan lanjutan, dan (4) memfasilitasi penandatanganan digital antara para pihak.

## 1.2 Problem Statement

**Masalah 1 — Ketidakpahaman isi kontrak (dari v1.0)**

Jutaan orang Indonesia menandatangani dokumen hukum setiap hari tanpa benar-benar memahami isinya. Hambatan utamanya adalah:

- Biaya konsultasi pengacara mahal (Rp 500K–5M per sesi) dan tidak terjangkau oleh mayoritas masyarakat.
- Dokumen hukum ditulis dalam bahasa legalistik yang sulit dipahami awam.
- Tidak ada tools mudah untuk memeriksa kepatuhan terhadap regulasi Indonesia.
- Kasus kerugian akibat klausul tersembunyi terus meningkat, terutama di sektor fintech.

**Masalah 2 — e-Signature tanpa informed consent (baru di v2.0)**

Platform e-signature yang ada (Privy, Mekari Sign, Vida) membuat proses tanda tangan terlalu mudah — pengguna langsung tanda tangan tanpa membaca. Ini menciptakan:

- Penandatanganan kontrak tanpa pemahaman — "asal klik setuju".
- Risiko sengketa di kemudian hari karena salah satu pihak tidak memahami isi kontrak.
- Perusahaan tidak bisa membuktikan bahwa penandatangan benar-benar memahami isi kontrak (informed consent).

## 1.3 Solution

TanyaHukum v2.0 menjadi **platform pertama di Indonesia yang menggabungkan analisis kontrak berbasis AI dengan tanda tangan digital** — menciptakan proses penandatanganan yang transparan dan melindungi kedua belah pihak.

**Proposisi nilai utama:**

> "Tanda tangan digital yang cerdas — pahami dulu, baru tanda tangan."

Untuk perusahaan: "Kirim kontrak yang transparan — lindungi bisnis Anda secara hukum."

## 1.4 Product Vision

Menjadi platform tanda tangan digital #1 di Indonesia yang memberdayakan setiap orang untuk **memahami hak dan kewajiban hukum mereka** sebelum menandatangani dokumen — sehingga tidak ada lagi orang yang dirugikan karena tidak membaca atau tidak mengerti kontrak.

## 1.5 Hackathon Context

| Item | Detail |
|------|--------|
| Hackathon | PIDI-DIGDAYA X Hackathon 2026 — Bank Indonesia |
| Prize Pool | Rp 1.4 Miliar |
| Submission Deadline | 27 Maret 2026 |
| Kategori | Fintech & Perlindungan Konsumen Digital |
| Team | 2 orang, vibe coding |
| Build Timeline | ~2 minggu |

---

# 2. Target Users

## 2.1 Primary Personas

**Persona 1: Rina — Karyawan Swasta (Personal)**

| Atribut | Detail |
|---------|--------|
| Usia / Profil | 28 tahun, HRD staff, Jakarta Selatan |
| Pain Point | Diminta tanda tangan kontrak kerja PKWT baru secara digital. Tidak yakin apakah masa probasi 6 bulan tanpa BPJS itu legal. |
| Goal | Memahami kontrak dalam 10 menit dan tanda tangan dengan tenang. |
| Use Case | Terima link kontrak dari perusahaan → AI analisis gratis (dibayar perusahaan) → review risiko → tanda tangan digital. |

**Persona 2: Budi — Pelaku UMKM (Personal)**

| Atribut | Detail |
|---------|--------|
| Usia / Profil | 42 tahun, pemilik toko online, Surabaya |
| Pain Point | Mau daftar merchant di platform marketplace besar. T&C-nya 40 halaman, tidak ada waktu baca. |
| Goal | Tahu klausul mana yang berisiko sebelum tandatangan. |
| Use Case | Upload T&C → AI analisis → cek risiko dispute resolution, biaya hidden charges, hak terminasi. |

**Persona 3: PT. StartupKu — Tim Legal Internal (B2B)**

| Atribut | Detail |
|---------|--------|
| Profil | Startup fintech Series A, tim legal 2 orang, 50+ kontrak/bulan |
| Pain Point | Review manual 2-3 jam per kontrak. Kirim kontrak ke karyawan baru tapi tidak bisa buktikan mereka baca sebelum tanda tangan. |
| Goal | Otomasi pre-screening + kirim kontrak ke karyawan dengan analisis AI — bukti informed consent. |
| Use Case | Upload kontrak → AI analisis internal → kirim ke karyawan untuk review + co-sign → audit trail lengkap. |

## 2.2 Secondary Users

- LBH / Lembaga Bantuan Hukum — tools untuk paralegal memproses lebih banyak kasus.
- Notaris / PPAT — pre-check akta sebelum penandatanganan.
- OJK / BPKN / instansi pemerintah — analisis massal T&C fintech untuk pengawasan.
- Developer / SaaS — integrasi via API ke produk mereka.

---

# 3. Core Features & Product Scope

## 3.1 Feature Overview

| # | Fitur | Deskripsi | Priority | Status |
|---|-------|-----------|----------|--------|
| F1 | Document Upload & Parsing | Upload PDF / paste teks → ekstrak teks bersih | P0 — MVP | Done (v1.0) |
| F2 | Clause Extraction | Identifikasi & segmentasi klausa-klausa kunci | P0 — MVP | Done (v1.0) |
| F3 | Risk Scoring | Skor risiko 0-10 per klausa + label AMAN / PERHATIAN / BERBAHAYA | P0 — MVP | Done (v1.0) |
| F4 | Legal Citation (RAG) | Setiap skor didukung referensi hukum Indonesia spesifik | P0 — MVP | Done (v1.0) |
| F5 | AI Legal Chatbot | Tanya jawab lanjutan berbasis konteks dokumen yang diupload | P0 — MVP | Done (v1.0) |
| F6 | Summary Report | Ringkasan eksekutif: overall score, jumlah klausa per risk level | P0 — MVP | Done (v1.0) |
| F7 | Consultation Booking | Booking konsultasi pengacara mitra via chatbot agent flow | P0 — MVP | Done (v1.0) |
| F8 | Demo Documents | Dokumen contoh (PKWT, pinjol, sewa kos) yang bisa dicoba langsung | P0 — MVP | Done (v1.0) |
| **F9** | **e-Signature** | **Tanda tangan digital pada dokumen** | **P1 — v2.0** | **Planned** |
| **F10** | **Document Sharing** | **Kirim dokumen ke pihak lain untuk review + co-sign** | **P1 — v2.0** | **Planned** |
| **F11** | **"Company Pays" Analysis** | **Pengirim menanggung biaya analisis AI untuk penerima** | **P1 — v2.0** | **Planned** |
| **F12** | **User Accounts & Quota** | **Registrasi, login, manajemen quota analisis + e-sign** | **P1 — v2.0** | **Planned** |
| F13 | History & Saved Analyses | Simpan & akses kembali hasil analisis sebelumnya | P1 | Planned |
| F14 | Team Management (B2B) | Invite & manage team members, shared quota | P2 — B2B | Planned |
| F15 | Template Library (B2B) | Simpan & reuse template kontrak | P2 — B2B | Planned |
| F16 | Bulk Upload (B2B) | Batch analyze multiple documents | P2 — B2B | Planned |
| F17 | Dashboard & Analytics (B2B) | Track semua dokumen, status signing, analytics | P2 — B2B | Planned |
| F18 | Audit Trail (B2B) | Full compliance log (siapa sign, kapan, IP, device) | P2 — B2B | Planned |
| F19 | Custom Branding (B2B) | White-label email & signing page | P2 — B2B | Planned |
| F20 | API Access (B2B) | REST API untuk integrasi ke sistem internal | P2 — B2B | Planned |
| F21 | Export PDF Report | Download laporan analisis dalam format PDF | P2 | Planned |

## 3.2 Feature Detail: e-Signature (F9) — NEW

**Alur tanda tangan digital:**

1. Pengguna upload dokumen dan jalankan analisis AI.
2. Setelah review hasil analisis, pengguna dapat menandatangani dokumen.
3. Tanda tangan berupa consent digital — nama, email, timestamp, IP address.
4. Dokumen yang sudah ditandatangani mendapat sertifikat digital (hash SHA-256).
5. PDF final dengan tanda tangan tersimpan dan dapat diunduh oleh semua pihak.

**Catatan:** Untuk hackathon/prototype, e-signature bersifat consent-based (bukan PSrE-certified). Sertifikasi PSrE dari Kominfo adalah roadmap post-launch.

## 3.3 Feature Detail: Document Sharing & Co-Sign (F10) — NEW

**Alur pengiriman dokumen untuk co-sign:**

1. Pengirim (biasanya perusahaan) upload dokumen dan analisis.
2. Pengirim menambahkan email penerima (satu atau lebih) sebagai co-signer.
3. Penerima mendapat email notifikasi dengan link ke dokumen.
4. Penerima membuka link → melihat analisis AI → review → tanda tangan.
5. Jika pengirim mengaktifkan "Company Pays" (F11), penerima bisa analisis tanpa kuota sendiri.
6. Setelah semua pihak tanda tangan, dokumen final tersedia untuk diunduh.

**Status dokumen:**

| Status | Deskripsi |
|--------|-----------|
| `draft` | Dokumen diupload, belum dianalisis |
| `analyzed` | Analisis AI selesai |
| `pending_signatures` | Menunggu tanda tangan dari satu/lebih pihak |
| `partially_signed` | Sebagian pihak sudah tanda tangan |
| `completed` | Semua pihak sudah tanda tangan |
| `expired` | Batas waktu tanda tangan terlewati |
| `rejected` | Salah satu pihak menolak menandatangani |

## 3.4 Feature Detail: "Company Pays" Analysis (F11) — NEW

Ketika perusahaan mengirim dokumen ke pihak lain untuk co-sign, perusahaan dapat memilih untuk menanggung biaya analisis AI. Artinya:

- Penerima bisa menjalankan analisis AI tanpa mengurangi kuota pribadi mereka.
- Kuota yang digunakan berasal dari akun pengirim (perusahaan).
- Penerima melihat badge: "Analisis AI gratis dari [Nama Perusahaan]".

Ini menjadi selling point utama untuk B2B karena:
- Membuktikan informed consent (perlindungan hukum untuk perusahaan).
- Meningkatkan trust dan transparansi dengan karyawan/mitra.
- Mengurangi risiko sengketa di kemudian hari.

## 3.5 Risk Scoring System (dari v1.0, updated)

Setiap klausa yang diekstrak diberikan skor risiko 0-10:

| Label | Skor | Warna | Kriteria Contoh |
|-------|------|-------|-----------------|
| AMAN | 0-3 | Hijau (#059669) | Klausul standar, melindungi hak pengguna, sesuai UU |
| PERHATIAN | 4-6 | Kuning (#D97706) | Auto-renewal, data sharing pemasaran, layanan bisa berubah sewaktu-waktu |
| BERBAHAYA | 7-10 | Merah (#DC2626) | Bunga >2%/hari, perubahan sepihak tanpa notif, penghapusan hak hukum |

## 3.6 Legal Citation Engine (dari v1.0)

Setiap skor risiko disertai referensi hukum spesifik dari knowledge base RAG:

- **Tier 1 — Kontrak & Konsumen:** UU 8/1999 (Perlindungan Konsumen), KUH Perdata Buku III, UU 6/2023 (Cipta Kerja).
- **Tier 1 — Ketenagakerjaan:** UU 13/2003 (Ketenagakerjaan), PP 35/2021 (PKWT), PP 36/2021 (Upah Minimum).
- **Tier 1 — Fintech:** POJK 77/2016 (Pinjol), POJK 6/2022 (Perilaku PUJK), POJK 10/2022 (BNPL/PayLater), UU 27/2022 (PDP).
- **Tier 2 — Pendukung:** UU 30/1999 (Arbitrase), PP 42/2007 (Franchise), PP 71/2019 (Sistem Elektronik).
- **Tier 2 — e-Signature:** UU 11/2008 (ITE), PP 71/2019 (PSTE), Permenkominfo 11/2018.

---

# 4. Two-Product Model & Pricing

## 4.1 Product Model

TanyaHukum menawarkan dua produk inti yang independen namun terintegrasi:

| Produk | Fungsi | Menggunakan Kuota |
|--------|--------|-------------------|
| **AI Analysis** | Upload & review dokumen dengan AI | 1 analisis = 1 kuota analisis |
| **e-Sign** | Tanda tangan digital pada dokumen | 1 tanda tangan = 1 kuota e-sign |

Kedua produk bisa digunakan secara terpisah atau bersamaan:
- Analisis tanpa tanda tangan (hanya review).
- Tanda tangan tanpa analisis (hanya e-sign).
- Analisis + tanda tangan (alur lengkap — diferensiasi utama TanyaHukum).

Semua pengguna — individu maupun perusahaan — berlangganan dan mendapatkan kuota. Perbedaannya ada pada tier fitur dan volume.

## 4.2 Personal Plans (Individu)

Ditampilkan di halaman `/pricing/` atau section pricing di landing page.

Prinsip: **Generous di e-sign, terbatas di analisis AI** — analisis AI adalah premium value.

| Fitur | Gratis | Starter (Rp 29K/bln) | Plus (Rp 79K/bln) |
|-------|--------|----------------------|---------------------|
| **e-Sign** | 50/bulan | Unlimited | Unlimited |
| **AI Analysis** | 3/bulan | 10/bulan | 30/bulan |
| AI Chatbot per dokumen | 10 pesan | 20 pesan | 50 pesan |
| Consultation booking | Tersedia | Tersedia | Tersedia |
| Riwayat analisis | 30 hari | 90 hari | 1 tahun |
| Export ringkasan PDF | — | Tersedia | Tersedia |

## 4.3 B2B Plans (Perusahaan)

Ditampilkan di halaman `/bisnis/`.

| Fitur | Starter (Rp 499K/bln) | Business (Rp 1.5M/bln) | Enterprise (Custom) |
|-------|------------------------|-------------------------|---------------------|
| **e-Sign** | Unlimited | Unlimited | Unlimited |
| **AI Analysis** | 250/bulan | 1.000/bulan | Unlimited |
| Team members | 5 | 20 | Unlimited |
| Kirim dokumen & co-sign | Tersedia | Tersedia | Tersedia |
| "Company Pays" analysis | Tersedia | Tersedia | Tersedia |
| Template library | — | Tersedia | Tersedia |
| Bulk upload | — | Tersedia | Tersedia |
| Dashboard & analytics | Basic | Full | Full + custom |
| Audit trail | Basic | Full compliance log | Full + export |
| Custom branding | — | — | Tersedia |
| API access | — | — | Tersedia |
| SLA & dedicated support | — | — | Tersedia |

## 4.4 "Company Pays" Model

Saat perusahaan mengirim dokumen ke pihak luar (karyawan, mitra, klien) untuk co-sign:

- **e-Sign kuota** dikonsumsi dari akun perusahaan untuk semua pihak.
- **Analisis AI kuota** dikonsumsi dari akun perusahaan jika fitur "Company Pays" diaktifkan.
- Penerima tidak perlu berlangganan atau punya kuota sendiri — mereka mendapat akses gratis.

Ini memberikan insentif bagi perusahaan untuk berlangganan paket B2B yang lebih besar.

---

# 5. User Journey & UX Flow

## 5.1 Core User Flow — Personal (Analisis Mandiri)

| Step | User Action | System Response | UI State |
|------|-------------|-----------------|----------|
| 1 | Buka landing page TanyaHukum | Tampilkan hero + CTA | Landing Page |
| 2 | Upload PDF / paste teks | Terima input, tampilkan loading | Upload State |
| 3 | Klik "Analisis Sekarang" | Parse → extract → embed → score (~15 detik) | Loading + Progress |
| 4 | Lihat halaman hasil analisis | Render clause cards dengan skor & citation | Results Page |
| 5 | Klik klausa untuk detail | Expand: teks klausa + pasal referensi + penjelasan AI | Expanded Card |
| 6 | Ketik pertanyaan di chatbot | Jawaban kontekstual berdasarkan dokumen | Chat Panel |
| 7 | (Opsional) Tanda tangan | Tambah tanda tangan digital pada dokumen | Signing Flow |

## 5.2 Core User Flow — B2B (Kirim & Co-Sign)

| Step | Actor | Action | System Response |
|------|-------|--------|-----------------|
| 1 | Company | Upload dokumen + analisis AI | Dokumen dianalisis, tersimpan di dashboard |
| 2 | Company | Tambahkan email penerima + aktifkan "Company Pays" | Sistem siap kirim |
| 3 | Company | Klik "Kirim untuk tanda tangan" | Email notifikasi dikirim ke penerima |
| 4 | Penerima | Buka email → klik link | Halaman review dokumen + analisis AI (gratis) |
| 5 | Penerima | Review analisis AI, baca klausa berisiko | Interaksi dengan clause cards + chatbot |
| 6 | Penerima | Tanda tangan digital | Tanda tangan tercatat (nama, email, timestamp, IP) |
| 7 | Company | Terima notifikasi "Dokumen ditandatangani" | Dashboard updated, PDF final tersedia |
| 8 | Semua | Download dokumen final yang sudah ditandatangani | PDF + sertifikat digital |

## 5.3 Key UX Principles

- **Pahami dulu, baru tanda tangan** — analisis AI ditampilkan sebelum opsi tanda tangan muncul.
- **Time-to-Value < 30 detik** — dari upload hingga hasil analisis pertama.
- **Zero learning curve** — tidak ada onboarding panjang, langsung ke input.
- **Progressive disclosure** — summary dulu, detail klausa on-demand.
- **Trust through transparency** — setiap skor punya alasan + referensi hukum.
- **Mobile-first** — mayoritas target user akses via smartphone.

## 5.4 Document Types Supported

| Kontrak Kerja | Kontrak Bisnis & Komersial | Fintech & Keuangan |
|---------------|---------------------------|---------------------|
| PKWT / PKWTT | PKS (Perjanjian Kerja Sama) | T&C Pinjol / P2P Lending |
| Perjanjian Freelance | NDA / Non-Disclosure Agreement | T&C PayLater / BNPL |
| Kontrak Magang | Perjanjian Distribusi | Akad Pembiayaan Syariah |
| Perjanjian Outsourcing | Franchise Agreement | Perjanjian KPR / KTA |
| — | Perjanjian Sewa Menyewa | T&C E-commerce / Marketplace |

---

# 6. Technical Architecture

## 6.1 Tech Stack

| Layer | Technology | Alasan |
|-------|------------|--------|
| Frontend | Next.js 15 + React 19 + Tailwind CSS 4 | Production-ready SSR, modern React |
| Deployment | Self-hosted (DigitalOcean) + Caddy | Full control, HTTPS, reverse proxy |
| Backend | FastAPI (Python 3.12) | Async, fast, great for AI/ML workloads |
| Database | MongoDB Atlas (+ vector search) | Document store + native vector search for RAG |
| AI Model | Claude Sonnet 4.6 (via DigitalOcean Gradient) | Best reasoning; OpenAI-compatible API |
| Embeddings | Mistral mistral-embed (1024 dim) | Consistent with regulation corpus |
| PDF Parsing | pdfplumber (Python) | Layout-aware, handles Indonesian legal PDFs |
| Email | Resend | Transactional email with custom domain |
| Process Manager | PM2 | Auto-restart, log management |

## 6.2 System Architecture (v2.0)

```
User uploads PDF / receives signing link
    |
[Next.js :3010] --> API proxy rewrites /api/* --> http://localhost:8000/api/*
    |
[FastAPI :8000]
    |-- pdfplumber: extract text
    |-- clause_splitter: regex split by Pasal/BAB/numbered sections  
    |-- Mistral API: embed clauses (1024-dim vectors)
    |-- MongoDB Atlas: $vectorSearch in legal_chunks (121K+ chunks)
    |-- Claude Sonnet 4.6 (via DO Gradient): analyze risk per clause
    |-- guardrails: input validation, citation grounding, topic enforcement
    |-- signing_service: consent capture, hash generation, PDF stamping (NEW)
    |-- notification_service: Resend email for signing requests (NEW)
    |
[MongoDB Atlas]
    |-- legal_chunks: 121K+ regulation chunks with embeddings
    |-- analyses: analysis results + PDF binary
    |-- consultation_bookings: lawyer consultation requests
    |-- documents: shared documents with signing status (NEW)
    |-- signatures: digital signature records (NEW)
    |-- users: user accounts with quota tracking (NEW)
```

## 6.3 API Endpoints

**Existing (v1.0):**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/analyze` | Upload PDF → full contract analysis |
| POST | `/api/chat` | Follow-up Q&A with legal context |
| POST | `/api/consultation` | Book lawyer consultation |
| GET | `/api/health` | Service health + MongoDB/LLM status |
| GET | `/api/analysis/{id}` | Retrieve analysis result |
| GET | `/api/analysis/{id}/pdf` | Retrieve original PDF |

**New (v2.0):**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | User login |
| GET | `/api/auth/me` | Get current user profile + quota |
| POST | `/api/documents/share` | Share document for co-signing |
| GET | `/api/documents/{id}/signers` | List signers and their status |
| POST | `/api/documents/{id}/sign` | Submit digital signature |
| POST | `/api/documents/{id}/reject` | Reject signing request |
| GET | `/api/documents/{id}/certificate` | Download signed PDF + certificate |
| GET | `/api/quota` | Get current quota usage |

## 6.4 Database Schema (v2.0 Additions)

**users collection:**
```
{
  _id: ObjectId,
  email: string,
  name: string,
  phone: string | null,
  plan: "free" | "starter" | "plus" | "b2b_starter" | "b2b_business" | "b2b_enterprise",
  company_name: string | null,
  quota: {
    analysis: { used: number, limit: number, reset_at: Date },
    esign: { used: number, limit: number, reset_at: Date },
    chat_per_doc: number
  },
  created_at: Date
}
```

**documents collection:**
```
{
  _id: string (document_id),
  owner_id: ObjectId (ref users),
  analysis_id: string (ref analyses),
  filename: string,
  status: "draft" | "analyzed" | "pending_signatures" | "partially_signed" | "completed" | "expired" | "rejected",
  company_pays_analysis: boolean,
  signers: [
    {
      email: string,
      name: string | null,
      role: "sender" | "recipient",
      status: "pending" | "signed" | "rejected",
      signed_at: Date | null,
      signature_id: ObjectId | null
    }
  ],
  expires_at: Date | null,
  created_at: Date,
  updated_at: Date
}
```

**signatures collection:**
```
{
  _id: ObjectId,
  document_id: string,
  signer_email: string,
  signer_name: string,
  ip_address: string,
  user_agent: string,
  consent_text: string,
  document_hash: string (SHA-256 of original PDF),
  signed_at: Date
}
```

## 6.5 RAG Pipeline (dari v1.0)

1. **Corpus Building** — PDFs hukum dari BPK (peraturan.bpk.go.id), hanya regulasi berstatus 'Berlaku'.
2. **Chunking** — Per-pasal boundaries, ~300-500 token per chunk.
3. **Embedding** — Mistral mistral-embed (1024 dim) → MongoDB Atlas vector search.
4. **Retrieval** — embed(clause_text) → cosine similarity → top-5 law chunks.
5. **Generation** — top-5 chunks + klausa → Claude Sonnet 4.6 → risk score + citation.

**Current corpus:** 121,418 chunks from 4,887+ regulation PDFs (8/16 relevant legal topics).

---

# 7. Legal Knowledge Base

## 7.1 Data Source — BPK Crawler

Sumber utama: peraturan.bpk.go.id — database resmi BPK yang mencakup seluruh peraturan perundang-undangan Indonesia.

Crawler otomatis (`scripts/crawl_bpk_v2.py`) dengan:
- Proxy Indonesia wajib (BPK blokir non-Indonesian IP via Cloudflare).
- Hanya regulasi berstatus 'Berlaku' yang diunduh.
- Resume-safe: progress disimpan ke `crawl_progress.json`.
- 17 metadata fields per regulasi.

## 7.2 Priority Regulations

| Tier | Regulasi | Relevance |
|------|----------|-----------|
| 1 | UU 8/1999 — Perlindungan Konsumen | Klausul baku, hak konsumen, larangan klausul sepihak |
| 1 | UU 13/2003 + UU 6/2023 — Ketenagakerjaan / Cipta Kerja | PKWT, pesangon, upah minimum |
| 1 | PP 35/2021 — PKWT | Syarat kontrak kerja waktu tertentu |
| 1 | UU 27/2022 — PDP | Klausa penggunaan data, consent, transfer data |
| 1 | POJK 77/2016 — Pinjol | Bunga, biaya, hak peminjam |
| 1 | POJK 10/2022 — BNPL/PayLater | Syarat produk PayLater, disclosure wajib |
| 1 | KUH Perdata Buku III | Hukum perjanjian umum |
| 2 | UU 11/2008 — ITE | Dasar hukum tanda tangan elektronik |
| 2 | PP 71/2019 — PSTE | Penyelenggara Sistem Elektronik, e-sign validity |
| 2 | UU 30/1999 — Arbitrase | Klausul penyelesaian sengketa |

---

# 8. Build Plan

## 8.1 What's Already Built (v1.0 — Hackathon Phase 0-3)

| Component | Status | Details |
|-----------|--------|---------|
| BPK Crawler | Done | 4,887+ PDFs, 121K+ chunks in MongoDB |
| Ingestion Pipeline | Done | PDF → chunk → Mistral embed → MongoDB |
| FastAPI Backend | Done | /api/analyze, /api/chat, /api/health, /api/consultation |
| Analysis Pipeline | Done | pdfplumber → clause split → RAG → Claude → structured JSON |
| Guardrails | Done | PDF validation, text length, citation grounding, topic filter |
| Next.js Frontend | Done | Landing page, upload, results, clause cards, chatbot |
| Rich Text Chatbot | Done | Markdown rendering, multiline input, agent flow |
| Consultation Booking | Done | Chatbot agent → collect info → Resend emails (user + admin) |
| Demo Documents | Done | 3 synthetic contracts (PKWT, pinjol, sewa kos) |
| Production Deployment | Done | DigitalOcean + Caddy + PM2, tanyahukum.dev |

## 8.2 What to Build Next (v2.0)

| Phase | Deliverable | Priority |
|-------|-------------|----------|
| v2.0-A | User accounts (register/login) + quota tracking | P1 |
| v2.0-B | e-Signature flow (consent-based signing on analysis results) | P1 |
| v2.0-C | Document sharing (send doc via email for co-sign) | P1 |
| v2.0-D | "Company Pays" analysis flag | P1 |
| v2.0-E | Signing notification emails (branded Resend templates) | P1 |
| v2.0-F | Signed document certificate + PDF download | P1 |
| v2.0-G | `/bisnis/` landing page with B2B pricing | P1 |
| v2.0-H | Personal pricing section update | P1 |
| v2.0-I | Team management (B2B) | P2 |
| v2.0-J | Dashboard & analytics (B2B) | P2 |
| v2.0-K | Template library | P2 |
| v2.0-L | Bulk upload | P2 |
| v2.0-M | API access | P2 |

## 8.3 MVP Scope Boundaries (v2.0)

**IN SCOPE (Hackathon Prototype):**

- User accounts (simple email/password, no OAuth yet)
- Quota system (enforced per plan)
- e-Signature on analyzed documents (consent-based, not PSrE-certified)
- Document sharing via email link
- "Company Pays" toggle when sharing
- Signing status tracking
- Notification emails via Resend
- `/bisnis/` page with B2B pitch + pricing

**OUT OF SCOPE (Post-Hackathon):**

- PSrE certification for legally-binding e-signatures
- Payment integration (Midtrans/Xendit)
- OAuth / SSO (Google, Microsoft)
- OCR for scanned PDFs
- API marketplace
- White-label / custom branding
- Mobile app

---

# 9. Success Metrics

## 9.1 Hackathon KPIs

| Metrik | Target | Measurement |
|--------|--------|-------------|
| Demo time-to-result | < 15 detik | Stopwatch saat demo |
| Accuracy skor risiko | > 80% match reviewer hukum | 5 dokumen uji |
| Legal citation precision | > 85% pasal relevan | Random sampling 20 output |
| Uptime demo day | 100% | Server monitoring |
| Signing flow demo | End-to-end berhasil | Live demo |
| Juri impression score | Top 3 kategori | Hackathon judging |

## 9.2 Post-Launch KPIs (Bulan 1-3)

- Aktivasi: 1.000 analisis + 500 e-sign dalam 30 hari pertama.
- Retention: D7 retention > 20%.
- Satisfaction: NPS > 40.
- Conversion: Free → Paid > 3%.
- B2B Pipeline: minimal 5 leads enterprise dalam 90 hari.

---

# 10. Risks & Mitigations

| # | Risiko | Kemungkinan | Mitigasi |
|---|--------|-------------|----------|
| R1 | AI hallucinate pasal hukum | Medium | RAG grounding wajib; setiap citation harus ada di vector DB; disclaimer di UI |
| R2 | BPK crawler rate limit | Low-Medium | Proxy Indonesia; fallback ke GitHub markdown dataset |
| R3 | Regulasi diubah/dicabut | Medium | Crawler hanya ambil 'Berlaku'; refresh corpus periodik |
| R4 | Liability hukum — AI dianggap praktik hukum | Medium | Disclaimer 'bukan nasihat hukum'; CTA ke pengacara; ToS |
| R5 | e-Signature validity challenged | Medium | Disclaimer "prototype"; consent-based dengan audit trail; roadmap PSrE |
| R6 | Data sensitivity (gaji, NIK dalam kontrak) | Medium | Tidak simpan raw text; proses in-memory; privacy notice |
| R7 | Kompetitor (Privy) menambah fitur AI | Low | First-mover advantage di AI+sign combo; deeper RAG Indonesia |
| R8 | Claude API latency > 15 detik | Low | Progress indicator; chunked analysis |

---

# 11. Competitive Landscape (Updated)

| Produk | AI Analysis | e-Signature | Hukum Indonesia | Harga |
|--------|-------------|-------------|-----------------|-------|
| **TanyaHukum** | Per klausa + RAG | Consent-based (roadmap PSrE) | Spesifik (121K chunks) | Rp 29K/bln |
| Privy | Tidak ada | PSrE-certified | Tidak ada | ~Rp 10K/tanda tangan |
| Mekari Sign | Tidak ada | PSrE-certified | Tidak ada | Rp 149K/bln |
| Vida | Tidak ada | PSrE-certified | Tidak ada | Enterprise only |
| ChatGPT / Claude | General (no grounding) | Tidak ada | Tidak reliable | USD 20/bln |
| Pengacara | Manual review | Wet ink / notaris | Spesifik | Rp 500K–5M/sesi |
| HUKUMONLINE | Database saja | Tidak ada | Manual search | Rp 1.5–3M/bln |

**TanyaHukum differentiator:** Satu-satunya platform yang menggabungkan analisis kontrak berbasis AI dengan tanda tangan digital — "pahami dulu, baru tanda tangan".

---

# 12. Appendix

## 12.1 Glossary

- **BPK** — Badan Pemeriksa Keuangan, lembaga yang mengelola database peraturan perundang-undangan Indonesia.
- **PKWT** — Perjanjian Kerja Waktu Tertentu (kontrak kerja terbatas / tidak tetap).
- **PKS** — Perjanjian Kerja Sama (business cooperation agreement).
- **POJK** — Peraturan Otoritas Jasa Keuangan.
- **RAG** — Retrieval-Augmented Generation, teknik AI yang menggabungkan pencarian basis pengetahuan dengan generasi teks.
- **PSrE** — Penyelenggara Sertifikasi Elektronik, lembaga yang berwenang menerbitkan sertifikat digital di Indonesia (diatur Kominfo).
- **e-Sign** — Tanda tangan elektronik, diakui secara hukum berdasarkan UU ITE & PP PSTE.
- **Informed Consent** — Persetujuan yang diberikan setelah mendapat informasi yang cukup tentang isi kontrak.
- **Co-sign** — Penandatanganan bersama oleh dua pihak atau lebih pada satu dokumen.
- **Company Pays** — Model di mana pengirim dokumen menanggung biaya analisis AI untuk penerima.

## 12.2 References

- UU No. 11 Tahun 2008 tentang Informasi dan Transaksi Elektronik (UU ITE).
- PP No. 71 Tahun 2019 tentang Penyelenggara Sistem dan Transaksi Elektronik.
- Permenkominfo No. 11 Tahun 2018 tentang Penyelenggara Sertifikasi Elektronik.
- UU No. 8 Tahun 1999 tentang Perlindungan Konsumen.
- UU No. 13 Tahun 2003 tentang Ketenagakerjaan.
- UU No. 27 Tahun 2022 tentang Perlindungan Data Pribadi.
