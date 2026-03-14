// Landing page content — edit here, not in components

export const NAV_LINKS = [
  { label: "Beranda", href: "/" },
  { label: "Fitur", anchor: "fitur" },
  { label: "Harga", anchor: "pricing" },
] as const;

export const STATS_BAR = [
  { value: "121.000+", label: "Regulasi Dianalisis" },
  { value: "<30 detik", label: "Waktu Analisis" },
  { value: "99,8%", label: "Akurasi Kutipan Hukum" },
  { value: "24/7", label: "AI Siap Kapan Saja" },
] as const;

export const FEATURES = [
  {
    icon: "🔍",
    title: "Analisis Kontrak Otomatis",
    description:
      "AI membaca setiap klausul dan membandingkannya dengan 121.000+ regulasi Indonesia untuk menemukan potensi risiko yang tersembunyi — dalam hitungan detik.",
  },
  {
    icon: "⚖️",
    title: "Kutipan Hukum yang Akurat",
    description:
      "Setiap skor risiko didukung referensi hukum spesifik dari UU, PP, POJK, dan regulasi resmi yang berlaku. Bukan opini umum, tapi dasar hukum yang jelas.",
  },
  {
    icon: "✍️",
    title: "Tanda Tangan Digital",
    description:
      "Tanda tangani dokumen secara digital setelah memahami isinya. Kirim ke pihak lain untuk review dan co-sign — semua tercatat dengan audit trail lengkap.",
  },
  {
    icon: "💬",
    title: "Chat Legal AI",
    description:
      "Tanyakan pertanyaan lanjutan tentang kontrak Anda. AI menjawab berdasarkan isi dokumen dan referensi hukum Indonesia yang relevan.",
  },
] as const;

export const COMPLIANCE_ITEMS = [
  "Enkripsi end-to-end untuk semua dokumen",
  "Patuh UU ITE dan regulasi OJK",
  "Server di Indonesia (tidak ada transfer data keluar negeri)",
  "ISO 27001 certified infrastructure",
  "Data Anda tidak pernah digunakan untuk training AI",
  'Hak hapus data sesuai "Right to be Forgotten"',
] as const;

export const HOW_IT_WORKS_STEPS = [
  {
    number: 1,
    title: "Unggah Dokumen Kontrak",
    description:
      "Upload kontrak kerja, sewa, jual-beli, atau dokumen hukum lainnya dalam format PDF atau Word.",
  },
  {
    number: 2,
    title: "AI Analisis Setiap Klausul",
    description:
      "Sistem kami membaca, menganalisis, dan membandingkan dengan database 50.000+ regulasi Indonesia dalam hitungan detik.",
  },
  {
    number: 3,
    title: "Dapatkan Laporan & Rekomendasi",
    description:
      "Terima analisis lengkap dengan highlight risiko, penjelasan hukum, dan opsi konsultasi dengan pengacara bersertifikat.",
  },
] as const;

export const ALL_PRICING_FEATURES = [
  "Tanda tangan digital",
  "Analisis AI",
  "Chat AI per dokumen",
  "Riwayat analisis",
  "Consultation booking",
  "Export ringkasan PDF",
] as const;

export const PRICING_PLANS = [
  {
    name: "Gratis",
    price: "Rp 0",
    period: "Per bulan",
    included: [
      "50 tanda tangan digital/bulan",
      "3 analisis AI/bulan",
      "10 pesan chat per dokumen",
      "Riwayat analisis 30 hari",
      "Consultation booking",
    ],
    excluded: [
      "Export ringkasan PDF",
    ],
    cta: "Mulai Gratis",
    ctaHref: "/cek-dokumen/",
    primary: false,
    disabled: false,
  },
  {
    name: "Starter",
    price: "Rp 29.000",
    period: "Per bulan",
    included: [
      "Tanda tangan digital unlimited",
      "10 analisis AI/bulan",
      "20 pesan chat per dokumen",
      "Riwayat analisis 90 hari",
      "Consultation booking",
      "Export ringkasan PDF",
    ],
    excluded: [],
    cta: "Pilih Starter",
    ctaHref: "/checkout/?account_type=personal&target_plan=starter&source=landing",
    primary: true,
    disabled: false,
  },
  {
    name: "Plus",
    price: "Rp 79.000",
    period: "Per bulan",
    included: [
      "Tanda tangan digital unlimited",
      "30 analisis AI/bulan",
      "50 pesan chat per dokumen",
      "Riwayat analisis 1 tahun",
      "Consultation booking",
      "Export ringkasan PDF",
    ],
    excluded: [],
    cta: "Pilih Plus Bisnis",
    ctaHref: "/checkout/?account_type=business&target_plan=plus&source=landing",
    primary: false,
    disabled: false,
  },
] as const;

export const FAQ_ITEMS = [
  {
    question: "Apakah TanyaHukum dapat menggantikan pengacara?",
    answer:
      "Tidak sepenuhnya. TanyaHukum adalah asisten AI yang membantu Anda memahami kontrak dengan lebih baik. Untuk kasus kompleks atau yang membutuhkan representasi hukum, Anda tetap memerlukan pengacara profesional. Namun, platform kami menyediakan opsi untuk booking konsultasi dengan pengacara bersertifikat.",
  },
  {
    question: "Berapa akurat analisis AI TanyaHukum?",
    answer:
      "AI kami dilatih dengan ribuan regulasi Indonesia dan telah diuji oleh tim legal profesional. Tingkat akurasi mencapai 95% untuk identifikasi klausul bermasalah. Namun, kami selalu merekomendasikan review manual untuk keputusan hukum yang krusial.",
  },
  {
    question: "Apakah data saya aman?",
    answer:
      "Sangat aman. Kami menggunakan enkripsi end-to-end, server berlokasi di Indonesia, dan mematuhi standar ISO 27001. Data Anda tidak akan pernah dibagikan atau digunakan untuk training AI tanpa persetujuan eksplisit.",
  },
  {
    question: "Jenis kontrak apa saja yang bisa dianalisis?",
    answer:
      "TanyaHukum dapat menganalisis berbagai jenis kontrak termasuk kontrak kerja, sewa-menyewa, jual-beli, perjanjian bisnis, NDA, dan dokumen hukum lainnya yang tunduk pada hukum Indonesia.",
  },
  {
    question: "Apakah ada trial gratis?",
    answer:
      "Ya! Paket Gratis memberikan Anda 50 tanda tangan digital dan 3 analisis AI per bulan tanpa biaya apapun. Tidak perlu kartu kredit untuk memulai.",
  },
  {
    question: "Bagaimana cara membatalkan langganan?",
    answer:
      "Anda dapat membatalkan langganan kapan saja dari dashboard akun Anda. Tidak ada biaya pembatalan dan Anda tetap dapat menggunakan fitur berbayar hingga akhir periode billing.",
  },
] as const;

export const FOOTER_SECTIONS = [
  {
    title: "Product",
    links: [
      { label: "Cek Dokumen", href: "/cek-dokumen/" },
      { label: "Bisnis", href: "/bisnis/" },
      { label: "Pricing", href: "#pricing" },
      { label: "API", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "#" },
      { label: "Help Center", href: "#" },
      { label: "Legal", href: "#" },
      { label: "Privacy", href: "#" },
    ],
  },
] as const;
