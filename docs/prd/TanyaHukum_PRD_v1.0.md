**TanyaHukum**

AI Legal Document Analysis Platform

*untuk Indonesia*

**PRODUCT REQUIREMENTS DOCUMENT**

Version 1.0 • March 2026

PIDI-DIGDAYA X Hackathon 2026 • Bank Indonesia

**1. Product Overview**

**1.1 Executive Summary**

TanyaHukum adalah platform analisis dokumen hukum berbasis AI yang dirancang khusus untuk pasar Indonesia. Platform ini membantu individu, pelaku UMKM, dan perusahaan untuk memahami risiko di dalam dokumen hukum yang mereka hadapi sehari-hari --- mulai dari syarat & ketentuan fintech, kontrak kerja, perjanjian sewa, hingga akad pembiayaan --- tanpa harus membayar biaya konsultasi hukum yang mahal di muka.

Pengguna cukup mengunggah dokumen, dan dalam waktu sekitar 15 detik TanyaHukum akan: (1) mengklasifikasi jenis dokumen, (2) mengekstrak klausa-klausa kunci, (3) memberikan skor risiko per klausa berdasarkan hukum Indonesia yang berlaku, dan (4) menyediakan chatbot untuk pertanyaan lanjutan.

**1.2 Problem Statement**

Jutaan orang Indonesia menandatangani dokumen hukum setiap hari tanpa benar-benar memahami isinya. Hambatan utamanya adalah:

-   Biaya konsultasi pengacara mahal (Rp 500K--5M per sesi) dan tidak terjangkau oleh mayoritas masyarakat.

-   Dokumen hukum ditulis dalam bahasa legalistik yang sulit dipahami awam.

-   Tidak ada tools mudah untuk memeriksa kepatuhan terhadap regulasi Indonesia (UU Perlindungan Konsumen, UU Ketenagakerjaan, POJK, dll).

-   Kasus kerugian akibat klausul tersembunyi (bunga harian tinggi, perubahan sepihak, penghapusan hak) terus meningkat, terutama di sektor fintech pinjol/PayLater.

**1.3 Solution**

TanyaHukum menjembatani kesenjangan ini dengan:

-   Analisis dokumen instan berbasis Claude Sonnet 4.6 (via DigitalOcean Gradient AI) dengan grounding ke database hukum Indonesia (BPK, OJK, PPATK).

-   Risk scoring transparan per klausa dengan referensi pasal hukum yang spesifik.

-   Antarmuka yang sederhana dan dapat diakses oleh semua kalangan.

-   Model monetisasi freemium yang memungkinkan akses dasar gratis dan fitur premium terjangkau.

**1.4 Product Vision**

+--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| **Visi Produk**                                                                                                                                                                                                                                              |
|                                                                                                                                                                                                                                                              |
| Menjadi asisten hukum digital #1 di Indonesia yang memberdayakan setiap warga untuk memahami hak dan kewajiban hukum mereka, sehingga tidak ada lagi orang yang dirugikan karena tidak membaca --- atau tidak mengerti --- dokumen yang mereka tandatangani. |
+--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

**1.5 Hackathon Context**

  ---------------------- --------------------------------------------------
  Hackathon              PIDI-DIGDAYA X Hackathon 2026 --- Bank Indonesia

  Prize Pool             Rp 1.4 Miliar

  Submission Deadline    27 Maret 2026

  Kategori               Fintech & Perlindungan Konsumen Digital

  Team                   2 orang, vibe coding

  Build Timeline         \~2 minggu
  ---------------------- --------------------------------------------------

**2. Target Users**

**2.1 Primary Personas**

**Persona 1: Rina --- Karyawan Swasta (B2C)**

  ------------------ -------------------------------------------------------------------------------------------------------------
  Usia / Profil      28 tahun, HRD, Jakarta Selatan

  Pain Point         Diminta tanda tangan kontrak kerja PKWT baru. Tidak yakin apakah masa probasi 6 bulan tanpa BPJS itu legal.

  Goal               Memahami kontraknya dalam 10 menit tanpa harus ke LBH.

  Use Case           Upload PDF kontrak kerja → lihat skor risiko → tanya chatbot soal hak pesangon.
  ------------------ -------------------------------------------------------------------------------------------------------------

**Persona 2: Budi --- Pelaku UMKM (B2C / B2B)**

  ------------------ ----------------------------------------------------------------------------------------------
  Usia / Profil      42 tahun, pemilik toko online, Surabaya

  Pain Point         Mau daftar merchant di platform marketplace besar. T&C-nya 40 halaman, tidak ada waktu baca.

  Goal               Tahu klausul mana yang berisiko sebelum tandatangan.

  Use Case           Paste URL T&C → AI ekstrak klausa dispute resolution, biaya hidden charges, hak terminasi.
  ------------------ ----------------------------------------------------------------------------------------------

**Persona 3: PT. StartupKu --- Tim Legal Internal (B2B)**

  ------------------ ---------------------------------------------------------------------------------------
  Profil             Startup fintech Series A, tim legal 2 orang harus review 50+ kontrak/bulan.

  Pain Point         Review manual memakan 2--3 jam per kontrak. Risiko human error.

  Goal               Otomasi pre-screening kontrak, fokus review manual hanya pada klausa berisiko tinggi.

  Use Case           API integration ke internal workflow. Bulk upload PKS, NDA, perjanjian distribusi.
  ------------------ ---------------------------------------------------------------------------------------

**2.2 Secondary Users**

-   LBH / Lembaga Bantuan Hukum --- tools untuk paralegal memproses lebih banyak kasus.

-   Notaris / PPAT --- pre-check akta sebelum penandatanganan.

-   OJK / BPKN / instansi pemerintah --- B2G: analisis massal T&C pinjol untuk pengawasan.

-   Developer / SaaS --- integrasi via API ke produk mereka.

**3. Core Features & Product Scope**

**3.1 Feature Overview**

  -------------------------------------------------------------------------------------------------------------------------
  **\#**   **Fitur**                   **Deskripsi**                                                        **Priority**
  -------- --------------------------- -------------------------------------------------------------------- ---------------
  F1       Document Upload & Parsing   Upload PDF / paste teks / URL → ekstrak teks bersih                  P0 --- MVP

  F2       Document Classification     Klasifikasi otomatis tipe dokumen (PKWT, T&C, PKS, NDA, dll)         P0 --- MVP

  F3       Clause Extraction           Identifikasi & segmentasi klausa-klausa kunci                        P0 --- MVP

  F4       Risk Scoring                Skor risiko 0--100 per klausa + label AMAN / PERHATIAN / BERBAHAYA   P0 --- MVP

  F5       Legal Citation              Setiap skor didukung referensi hukum Indonesia spesifik (pasal)      P0 --- MVP

  F6       AI Legal Chatbot            Tanya jawab lanjutan berbasis konteks dokumen yang diupload          P0 --- MVP

  F7       Summary Report              Ringkasan eksekutif: overall score, jumlah klausa per risk level     P0 --- MVP

  F8       Consultation CTA            Tombol booking konsultasi pengacara mitra (Rp 150K--500K/sesi)       P1

  F9       History & Saved Analyses    Simpan & akses kembali hasil analisis sebelumnya                     P1

  F10      Export PDF Report           Download laporan analisis dalam format PDF                           P2

  F11      API Access                  REST API untuk integrasi B2B / developer                             P2

  F12      Bulk Analysis               Upload & proses multiple dokumen sekaligus (B2B)                     P2
  -------------------------------------------------------------------------------------------------------------------------

**3.2 Feature Detail: Document Ingestion (F1)**

Tiga metode input yang didukung:

-   PDF Upload --- drag & drop atau file browser, max 20MB, support scan (OCR via Tesseract).

-   Text Paste --- paste langsung ke textarea, hingga 50.000 karakter.

-   URL Submission --- masukkan URL halaman T&C (crawled via Firecrawl, preprocessing bersih).

Output: teks bersih yang dinormalisasi, siap untuk proses analisis.

**3.3 Feature Detail: Risk Scoring System (F4)**

Setiap klausa yang diekstrak diberikan skor risiko 0--100 berdasarkan kepatuhan terhadap hukum Indonesia yang berlaku.

  --------------------------------------------------------------------------------------------------------------------------
  **Label**       **Skor**     **Warna**          **Kriteria Contoh**
  --------------- ------------ ------------------ --------------------------------------------------------------------------
  **AMAN**        0 -- 29      Hijau (#1A7340)    Klausul standar, melindungi hak pengguna, sesuai UU

  **PERHATIAN**   30 -- 69     Kuning (#7B5800)   Auto-renewal, data sharing pemasaran, layanan bisa berubah sewaktu-waktu

  **BERBAHAYA**   70 -- 100    Merah (#B71C1C)    Bunga \>2%/hari, perubahan sepihak tanpa notif, penghapusan hak hukum
  --------------------------------------------------------------------------------------------------------------------------

**3.4 Feature Detail: Legal Citation Engine (F5)**

Setiap skor risiko disertai referensi hukum spesifik, diambil dari knowledge base RAG TanyaHukum:

-   Tier 1 --- Kontrak & Konsumen: UU 8/1999 (Perlindungan Konsumen), KUH Perdata Buku III, UU 6/2023 (Cipta Kerja).

-   Tier 1 --- Ketenagakerjaan: UU 13/2003 (Ketenagakerjaan), PP 35/2021 (PKWT), PP 36/2021 (Upah Minimum).

-   Tier 1 --- Fintech: POJK 77/2016 (Pinjol), POJK 6/2022 (Perilaku PUJK), POJK 10/2022 (BNPL/PayLater), UU 27/2022 (PDP).

-   Tier 2 --- Pendukung: UU 30/1999 (Arbitrase), PP 42/2007 (Franchise), PP 71/2019 (Sistem Elektronik).

+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| **Demo Moment (Hackathon)**                                                                                                                                                                                                  |
|                                                                                                                                                                                                                              |
| Paste Shopee PayLater T&C → 15 detik → klausa \"Shopee dapat mengubah fitur layanan kapan saja\" diberi label PERHATIAN (skor 55) dengan referensi Pasal 18 UU 8/1999 tentang larangan klausul baku yang merugikan konsumen. |
+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

**4. Technical Architecture**

**4.1 Tech Stack**

  -----------------------------------------------------------------------------------------------------------------------
  **Layer**        **Technology**                         **Alasan Pemilihan**
  ---------------- -------------------------------------- ---------------------------------------------------------------
  Frontend         Next.js 14 + Tailwind + shadcn/ui      Server-side rendering, component library siap pakai

  Deployment       Vercel                                 Free tier, CI/CD otomatis dari GitHub, edge functions

  Backend          Next.js API Routes                     Fullstack dalam satu repo, cocok untuk hackathon speed

  Database         MongoDB Atlas (+ vector search)        Managed NoSQL + native vector search, already used for regulation corpus

  AI Model         Claude Sonnet 4.6 (via DigitalOcean Gradient)   Best-in-class reasoning; OpenAI-compatible API at inference.do-ai.run

  Embeddings       Mistral mistral-embed (1024 dim)       Already used in ingestion pipeline, consistent with regulation corpus

  PDF Parsing      pdfplumber (Python)                    Layout-aware, handles Indonesian legal PDFs, proven with 4,887 BPK docs

  Web Crawl        Firecrawl API                          Diperlukan untuk URL submission & crawl BPK (bypass JS)

  Auth             Skip (Hackathon)                       Tidak diperlukan untuk demo MVP
  -----------------------------------------------------------------------------------------------------------------------

**4.2 System Architecture Diagram**

+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| **High-Level Flow**                                                                                                                                                                                                                                                                                                                                                           |
|                                                                                                                                                                                                                                                                                                                                                                               |
| User Input (PDF / Text / URL) → Ingestion Layer (pdfplumber + clean text) → Clause Extraction → Claude Sonnet 4.6 (via DO Gradient) → Risk Scoring Prompt (with RAG context) → MongoDB vector search: embed(clause) → similarity search → top 5 law chunks → Claude Sonnet 4.6 → risk score + legal citation per clause → Result Store → MongoDB analyses collection → Response → Frontend (clause cards + chatbot) |
+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

**4.3 Core API Routes**

**POST /api/analyze**

Input: { document_text: string } atau { file: File } atau { url: string }

Output:

-   document_type: string (e.g. \"PKWT\", \"T&C Fintech\", \"Perjanjian Sewa\")

-   overall_score: number (0--100)

-   verdict: \"AMAN\" \| \"PERLU PERHATIAN\" \| \"BERBAHAYA\"

-   clauses: Array\<{ id, text, category, risk_score, risk_label, legal_basis, explanation }\>

-   summary: { total_clauses, aman_count, perhatian_count, berbahaya_count }

**POST /api/chat**

Input: { message: string, analysis_id: string, history: Message\[\] }

Output: { reply: string, citations: string\[\] }

Konteks: seluruh hasil analisis dokumen di-inject ke system prompt agar AI menjawab spesifik terhadap dokumen yang diupload.

**4.4 Database Schema**

+--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| **Supabase Tables**                                                                                                                                                                                                                                                                                                                                          |
|                                                                                                                                                                                                                                                                                                                                                              |
| legal_chunks id \| content TEXT \| embedding VECTOR(1024) \| source \| pasal_ref \| category \| relevant_for \| url \| chunk_index analyses id UUID \| document_hash \| document_type \| overall_score \| verdict \| clauses JSONB \| summary JSONB \| created_at chat_sessions id UUID \| analysis_id UUID FK \| messages JSONB \| created_at \| updated_at |
+--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

**4.5 RAG (Retrieval-Augmented Generation) Pipeline**

TanyaHukum menggunakan RAG untuk memastikan setiap penilaian risiko didasarkan pada hukum Indonesia yang aktual, bukan hanya pengetahuan umum model AI.

1.  Corpus Building --- PDFs hukum dari BPK (peraturan.bpk.go.id) diunduh via crawler otomatis (crawl_bpk.py). Hanya regulasi berstatus \'Berlaku\' yang diambil.

2.  Chunking --- Teks regulasi dipotong per-pasal (respecting pasal boundaries, bukan sliding window biasa). Setiap chunk \~300--500 token.

3.  Embedding --- Setiap chunk di-embed dengan Mistral mistral-embed (1024 dim), disimpan ke MongoDB Atlas vector search.

4.  Retrieval --- Saat scoring klausa, embed(clause_text) → cosine similarity search di MongoDB → ambil top-5 law chunks paling relevan.

5.  Generation --- top-5 chunks + klausa → injected ke Claude Sonnet 4.6 prompt (via DO Gradient) → output: skor + justifikasi + referensi pasal.

**5. Legal Knowledge Base**

**5.1 Data Source --- BPK Crawler**

Sumber utama: peraturan.bpk.go.id --- database resmi BPK (Badan Pemeriksa Keuangan) yang mencakup seluruh peraturan perundang-undangan Indonesia. Crawler otomatis (scripts/crawl_bpk.py) mengambil hanya regulasi berstatus \'Berlaku\'.

**Alur Crawler**

6.  GET /Subjek → auto-discover semua tema ID + jumlah regulasi per subjek.

7.  GET /Search?tema=X&p=N → listing semua regulasi per tema, paginated. Deteksi \'Berlaku\' vs \'Dicabut\' dari search page.

8.  Download PDF langsung dari link yang tersedia di search page (tidak perlu kunjungi /Details kecuali edge case).

9.  Resume-safe: progress disimpan ke crawl_progress.json setiap 50 regulasi.

**5.2 Priority Regulations**

  ------------------------------------------------------------------------------------------------------------------------------------------------
  **Tier**   **Regulasi**                                               **Relevance untuk TanyaHukum**                         **Status**
  ---------- ---------------------------------------------------------- ------------------------------------------------------ -------------------
  1          UU 8/1999 --- Perlindungan Konsumen                        Klausul baku, hak konsumen, larangan klausul sepihak   Berlaku

  1          UU 13/2003 + UU 6/2023 --- Ketenagakerjaan / Cipta Kerja   PKWT, pesangon, upah minimum, hak karyawan             Berlaku

  1          PP 35/2021 --- PKWT                                        Syarat kontrak kerja waktu tertentu                    Berlaku

  1          UU 27/2022 --- PDP (Perlindungan Data Pribadi)             Klausa penggunaan data, consent, transfer data         Berlaku

  1          POJK 77/2016 --- Fintech Lending / Pinjol                  Bunga, biaya, hak peminjam                             Berlaku (amended)

  1          POJK 10/2022 --- BNPL / PayLater                           Syarat produk PayLater, disclosure wajib               Berlaku

  1          POJK 6/2022 --- Perilaku PUJK                              Perlindungan konsumen jasa keuangan                    Berlaku

  1          KUH Perdata Buku III                                       Hukum perjanjian umum, kekuatan mengikat kontrak       Berlaku

  2          UU 30/1999 --- Arbitrase                                   Klausul penyelesaian sengketa                          Berlaku

  2          PP 42/2007 --- Franchise                                   Perjanjian waralaba, disclosure                        Berlaku

  2          PP 71/2019 --- Penyelenggara Sistem Elektronik             Kontrak platform digital, SLA                          Berlaku
  ------------------------------------------------------------------------------------------------------------------------------------------------

**5.3 Alternative Source (Fallback)**

GitHub: github.com/Open-Technology-Foundation/peraturan.go.id --- 5.817 dokumen hukum (2001--2025) sudah dalam format markdown bersih. Bisa digunakan sebagai fallback atau supplement jika crawler BPK terkendala. License: GPL-3.0.

**6. User Journey & UX Flow**

**6.1 Core User Flow (MVP)**

  ----------------------------------------------------------------------------------------------------------------------------------------------
  **Step**   **User Action**                          **System Response**                                     **UI State**
  ---------- ---------------------------------------- ------------------------------------------------------- ----------------------------------
  1          Buka landing page TanyaHukum             Tampilkan hero + 3 cara input                           Landing Page

  2          Upload PDF / paste teks / masukkan URL   Terima input, tampilkan loading                         Upload State

  3          Klik \'Analisis Sekarang\'               Parse → extract → embed → score (±15 detik)             Loading Spinner + Progress Steps

  4          Lihat halaman hasil analisis             Render clause cards dengan skor & citation              Results Page

  5          Klik klausa BERBAHAYA untuk detail       Expand: teks klausa + pasal referensi + penjelasan AI   Expanded Clause Card

  6          Ketik pertanyaan di chatbot              Jawaban kontekstual berdasarkan dokumen                 Chat Panel

  7          Klik \'Konsultasi Pengacara\'            Redirect ke booking form / WhatsApp                     External CTA
  ----------------------------------------------------------------------------------------------------------------------------------------------

**6.2 Key UX Principles**

-   Time-to-Value \< 30 detik --- dari upload hingga hasil analisis pertama.

-   Zero learning curve --- tidak ada onboarding panjang, langsung ke input.

-   Progressive disclosure --- summary dulu, detail klausa on-demand.

-   Trust through transparency --- setiap skor punya alasan + referensi hukum yang bisa diklik.

-   Mobile-first --- mayoritas target user akses via smartphone.

**6.3 Document Types Supported**

TanyaHukum dirancang untuk menangani semua jenis dokumen hukum Indonesia, tidak terbatas pada:

  ----------------------------------------------------------------------------------------
  **Kontrak Kerja**        **Kontrak Bisnis & Komersial**   **Fintech & Keuangan**
  ------------------------ -------------------------------- ------------------------------
  PKWT / PKWTT             PKS (Perjanjian Kerja Sama)      T&C Pinjol / P2P Lending

  Perjanjian Freelance     NDA / Non-Disclosure Agreement   T&C PayLater / BNPL

  Kontrak Magang           Perjanjian Distribusi            Akad Pembiayaan Syariah

  Perjanjian Outsourcing   Franchise Agreement              Perjanjian KPR / KTA

  ---                      Perjanjian Sewa Menyewa          T&C E-commerce / Marketplace
  ----------------------------------------------------------------------------------------

**7. Business Model & Monetization**

**7.1 Revenue Streams**

**Stream 1: B2C Freemium Subscription**

  ---------------------------------------------------------------------------------------------------------------
  **Tier**         **Harga**           **Limit**             **Fitur Utama**
  ---------------- ------------------- --------------------- ----------------------------------------------------
  Free             Rp 0 / bulan        3 analisis / bulan    Analisis dasar, chatbot 5 pertanyaan/dokumen

  Basic            Rp 29.000 / bulan   20 analisis / bulan   \+ History, export PDF ringkasan

  Pro              Rp 79.000 / bulan   Unlimited             \+ URL analysis, prioritas processing, full export
  ---------------------------------------------------------------------------------------------------------------

**Stream 2: B2B Enterprise**

-   Paket mulai Rp 10 juta -- 50 juta / bulan.

-   Fitur: bulk upload, API access, custom risk rules, dedicated support, white-label opsi.

-   Target: firma hukum, startup fintech, perusahaan multifinance, platform marketplace.

**Stream 3: Consultation Referral**

-   CTA booking konsultasi pengacara mitra Rp 150K -- 500K / sesi.

-   TanyaHukum mengambil komisi 20--30% per booking.

-   Sinergi kuat: pengguna yang menemukan klausa berbahaya punya intent tinggi untuk konsultasi.

**Stream 4: B2G**

-   Lisensi khusus untuk OJK, BPKN, Kemenkumham untuk pengawasan massal T&C fintech.

-   Bisa diposisikan sebagai alat monitoring kepatuhan perlindungan konsumen.

**Stream 5: API Marketplace**

-   API per-analisis: Rp 500 -- 2.000 / dokumen untuk developer yang ingin embed ke produk mereka.

**7.2 Unit Economics (Proyeksi Awal)**

  ------------------------------------------------------------------------
  **Metrik**                   **Bulan 6**           **Bulan 12**
  ---------------------------- --------------------- ---------------------
  MAU (Monthly Active Users)   5.000                 25.000

  Konversi Free → Paid         5%                    8%

  Paying Users                 250                   2.000

  ARPU B2C                     Rp 45.000             Rp 50.000

  B2B Clients                  5                     20

  MRR Proyeksi                 \~Rp 61 juta          \~Rp 600 juta
  ------------------------------------------------------------------------

**8. Hackathon Build Plan**

**8.1 Build Order**

  ----------------------------------------------------------------------------------------------------------------------------------
  **Phase**   **Nama**                **Deliverable**                                                               **Est. Waktu**
  ----------- ----------------------- ----------------------------------------------------------------------------- ----------------
  0           Data & Infrastructure   Crawl BPK PDFs (\--relevant-only), chunk, embed, populate Supabase pgvector   Hari 1--2

  1           Core API                POST /api/analyze (full pipeline), POST /api/chat                             Hari 3--5

  2           Frontend MVP            Upload UI, Results page (clause cards), Chat panel                            Hari 6--9

  3           Polish & Demo Prep      Loading states, error handling, demo documents ready, Vercel deploy           Hari 10--12

  4           Submission              Final testing, video demo, slide deck, submit by 27 Maret                     Hari 13--14
  ----------------------------------------------------------------------------------------------------------------------------------

**8.2 Demo Documents (Prepared for Submission)**

-   Shopee PayLater T&C (public URL) --- expected: 3--5 klausa PERHATIAN terkait data sharing & perubahan sepihak.

-   Generic startup employment contract (PKWT template) --- expected: 2 klausa BERBAHAYA terkait probasi tanpa BPJS & non-compete tidak wajar.

-   OJK-registered pinjol agreement --- expected: 1 klausa BERBAHAYA (bunga efektif tahunan tersembunyi di kecil-kecil).

**8.3 MVP Scope Boundaries**

+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| **IN SCOPE (MVP)**                                                                                                                                                                                               |
|                                                                                                                                                                                                                  |
| ✓ Analisis dokumen (PDF upload + text paste) ✓ Clause extraction + risk scoring ✓ Legal citation (RAG-based) ✓ AI chatbot per dokumen ✓ Summary report di UI ✓ Consultation CTA ✓ Vercel deployment (public URL) |
+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

+------------------------------------------------------------------------------------------------------------------------------------------------------------+
| **OUT OF SCOPE (Post-Hackathon)**                                                                                                                          |
|                                                                                                                                                            |
| ✗ Authentication / user accounts ✗ Payment integration ✗ URL crawl analysis (F1 mode 3) ✗ Export PDF report ✗ B2B API / bulk analysis ✗ OCR untuk scan PDF |
+------------------------------------------------------------------------------------------------------------------------------------------------------------+

**9. Success Metrics**

**9.1 Hackathon KPIs**

  ----------------------------------------------------------------------------------------------
  **Metrik**                           **Target**                    **Measurement**
  ------------------------------------ ----------------------------- ---------------------------
  Demo time-to-result                  \< 15 detik                   Stopwatch saat demo

  Accuracy skor risiko (manual eval)   \> 80% match reviewer hukum   5 dokumen uji, 2 reviewer

  Legal citation precision             \> 85% pasal relevan          Random sampling 20 output

  Uptime demo day                      100%                          Vercel status

  Juri impression score                Top 3 kategori                Hackathon judging
  ----------------------------------------------------------------------------------------------

**9.2 Post-Launch KPIs (Bulan 1--3)**

-   Aktivasi: 1.000 analisis dokumen dalam 30 hari pertama post-launch.

-   Retention: D7 retention \> 20% (pengguna kembali analisis dokumen kedua).

-   Satisfaction: NPS \> 40 dari pengguna yang selesai analisis.

-   Conversion: Free → Paid \> 3% dalam bulan pertama.

-   B2B Pipeline: minimal 3 leads enterprise dalam 90 hari.

**10. Risks & Mitigations**

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **\#**   **Risiko**                                                **Kemungkinan**   **Mitigasi**                                                                                 **Owner**
  -------- --------------------------------------------------------- ----------------- -------------------------------------------------------------------------------------------- -----------------
  R1       AI hallucinate pasal hukum yang tidak ada                 Medium            RAG grounding wajib; setiap citation harus ada di vector DB; disclaimer legal di UI          Tech

  R2       BPK crawler 403 / rate limit                              Low-Medium        Firecrawl sudah menangani ini; fallback ke GitHub markdown dataset                           Tech

  R3       Regulasi sudah diubah / dicabut setelah corpus dibangun   Medium            Crawler hanya ambil \'Berlaku\'; metadata \'amended_by\' disimpan; refresh corpus periodik   Tech

  R4       Liability hukum --- AI dianggap praktik hukum ilegal      Medium            Disclaimer jelas \'bukan nasihat hukum\'; CTA ke pengacara mitra; ToS yang tepat             Legal / Product

  R5       Claude API latency \> 15 detik untuk dokumen panjang      Low               Streaming response; progress indicator; chunked analysis (per-klausa paralel)                Tech

  R6       Cost API via DigitalOcean Gradient melebihi budget       Low (Hackathon)   Gunakan claude-sonnet-4.6 ($3/$15 per 1M token); cache hasil per document_hash; DO credits    Tech

  R7       Dokumen mengandung data sensitif (gaji, NIK)              Medium            Tidak simpan raw document, hanya hash; proses in-memory; privacy notice di UI                Product / Legal
  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**11. Non-Functional Requirements**

  ---------------------------------------------------------------------------------------------------------------
  **Kategori**     **Requirement**                                 **Target**
  ---------------- ----------------------------------------------- ----------------------------------------------
  Performance      Time-to-first-result (dokumen \< 5 halaman)     \< 15 detik

  Performance      Chatbot response time                           \< 5 detik (streaming)

  Reliability      Uptime (post-launch)                            \> 99.5% (Vercel SLA)

  Privacy          Dokumen tidak disimpan permanen tanpa consent   Raw text di-hash saja; deleted post-analysis

  Security         API keys tidak exposed ke frontend              Server-side only via Next.js API routes

  Accessibility    Mobile-responsive                               Breakpoint min. 320px

  Localization     Bahasa Indonesia                                Seluruh UI dalam Bahasa Indonesia

  Scalability      Concurrent analyses (post-launch)               Target 50 concurrent dengan Vercel Edge
  ---------------------------------------------------------------------------------------------------------------

**12. Appendix**

**12.1 Prompt Engineering --- /api/analyze**

+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| **System Prompt Structure (analyze)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| You are TanyaHukum, an AI legal assistant specialized in Indonesian law. Your task: 1. Identify the document type (PKWT, T&C Fintech, Perjanjian Sewa, NDA, PKS, dll) 2. Extract key clauses that may affect user rights/obligations 3. For each clause: - Assign risk score 0-100 - Label: AMAN (0-29) / PERHATIAN (30-69) / BERBAHAYA (70-100) - Cite specific Indonesian law (UU/PP/POJK + pasal number) - Explain why in simple Bahasa Indonesia \[RELEVANT LAW CONTEXT\] {top_5_rag_chunks} Respond ONLY in JSON format. |
+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

**12.2 Prompt Engineering --- /api/chat**

+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| **System Prompt Structure (chat)**                                                                                                                                                                                                                                                                                                                                                                                                 |
|                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| You are TanyaHukum, an AI legal assistant. Document analyzed: {document_type} Overall risk: {verdict} (score: {overall_score}) Document clauses: {clauses_json} Relevant Indonesian laws: {rag_context} Answer the user\'s question specifically about their document. Always cite relevant pasal. Use simple Bahasa Indonesia. DISCLAIMER: Ini bukan nasihat hukum formal. Untuk kepastian hukum, konsultasikan dengan pengacara. |
+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

**12.3 Competitive Landscape**

  -------------------------------------------------------------------------------------------------------------
  **Produk**               **Hukum Indonesia**   **Risk Scoring**   **Legal Citation**   **Harga**
  ------------------------ --------------------- ------------------ -------------------- ----------------------
  TanyaHukum               ✅ Spesifik           ✅ Per klausa      ✅ Pasal spesifik    Rp 29K/bulan

  ChatGPT / Claude (raw)   ⚠️ General            ❌ Tidak ada       ❌ Tidak reliable    USD 20/bulan

  Pengacara konvensional   ✅ Spesifik           ✅ Manual          ✅ Manual            Rp 500K--5M/sesi

  LawGeex (US-focused)     ❌ Tidak ada          ✅ Per klausa      ❌ US law only       Enterprise only

  HUKUMONLINE              ✅ Database           ❌ Tidak ada       ❌ Manual search     Rp 1.5--3 juta/bulan
  -------------------------------------------------------------------------------------------------------------

**12.4 Glossary**

-   BPK --- Badan Pemeriksa Keuangan, lembaga yang mengelola database peraturan perundang-undangan Indonesia di peraturan.bpk.go.id

-   PKWT --- Perjanjian Kerja Waktu Tertentu (kontrak kerja terbatas / tidak tetap)

-   PKS --- Perjanjian Kerja Sama (business cooperation agreement)

-   POJK --- Peraturan Otoritas Jasa Keuangan

-   RAG --- Retrieval-Augmented Generation, teknik AI yang menggabungkan pencarian basis pengetahuan dengan generasi teks

-   pgvector --- ekstensi PostgreSQL untuk penyimpanan dan pencarian vektor (digunakan oleh Supabase)

-   KPR --- Kredit Pemilikan Rumah

-   KTA --- Kredit Tanpa Agunan
