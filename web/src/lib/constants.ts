// Landing page content — edit here, not in components

export const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Fitur", href: "#features" },
  { label: "Harga", href: "#pricing" },
  { label: "F.A.Q.", href: "#faq" },
] as const;

export const TRUST_PARTNERS = [
  "Kementerian Hukum",
  "LBH Indonesia",
  "Advokat Indonesia",
] as const;

export const FEATURES = [
  {
    icon: "🔍",
    title: "Analisis Kontrak Otomatis",
    description:
      "AI kami membaca setiap klausul dan membandingkannya dengan ribuan regulasi Indonesia untuk menemukan potensi risiko yang tersembunyi.",
  },
  {
    icon: "⚖️",
    title: "Validasi Hukum Real-Time",
    description:
      "Setiap analisis didukung oleh kutipan hukum yang aktual dari UU, Perpres, dan regulasi resmi pemerintah Indonesia.",
  },
  {
    icon: "🔒",
    title: "Deteksi Klausul Berbahaya",
    description:
      "Sistem kami secara otomatis menandai klausul yang merugikan, tidak adil, atau bertentangan dengan hukum konsumen Indonesia.",
  },
  {
    icon: "💬",
    title: "Chat Legal AI 24/7",
    description:
      "Tanyakan pertanyaan lanjutan tentang kontrak Anda kapan saja. AI kami siap menjawab dengan referensi hukum yang jelas.",
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
  "Analisis kontrak",
  "Chat AI",
  "Database hukum",
  "Priority support",
  "API access",
  "Custom training",
  "Dedicated support",
] as const;

export const PRICING_PLANS = [
  {
    name: "Free Tier",
    price: "Rp 0",
    period: "Per bulan",
    included: [
      "5 analisis kontrak/bulan",
      "Chat AI basic",
      "Database hukum terbatas",
    ],
    excluded: [
      "Priority support",
      "API access",
      "Custom training",
      "Dedicated support",
    ],
    cta: "Coba Gratis",
    ctaHref: "/cek-dokumen/",
    primary: false,
    disabled: false,
  },
  {
    name: "Professional",
    price: "Rp 99.000",
    period: "Per bulan",
    included: [
      "Unlimited analisis kontrak",
      "Chat AI advanced",
      "Full database hukum",
      "Priority support",
    ],
    excluded: [
      "API access",
      "Custom training",
      "Dedicated support",
    ],
    cta: "Segera Hadir",
    ctaHref: null,
    primary: true,
    disabled: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "Hubungi kami",
    included: [
      "Semua fitur Professional",
      "API access",
      "Custom training",
      "Dedicated support",
    ],
    excluded: [],
    cta: "Segera Hadir",
    ctaHref: null,
    primary: false,
    disabled: true,
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
      "Ya! Kami menyediakan tier gratis yang memungkinkan Anda menganalisis hingga 5 kontrak per bulan tanpa biaya apapun. Tidak perlu kartu kredit untuk memulai.",
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
      { label: "Features", href: "#" },
      { label: "Pricing", href: "#" },
      { label: "Use Cases", href: "#" },
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
