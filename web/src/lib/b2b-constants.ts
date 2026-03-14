// B2B page content — edit here, not in components

export const B2B_HERO = {
  title: "Kontrak Transparan, Bisnis Terlindungi",
  highlight: "TanyaHukum Bisnis",
  description:
    "Kirim kontrak ke karyawan, mitra, atau klien — lengkap dengan analisis AI yang membantu mereka memahami setiap klausa sebelum menandatangani. Bukti informed consent yang melindungi kedua belah pihak.",
  cta: "Mulai Checkout Bisnis",
  ctaHref: "/checkout/?account_type=business&target_plan=plus&source=bisnis",
} as const;

export const B2B_PROBLEMS = [
  {
    number: "01",
    title: "Review kontrak manual memakan waktu berjam-jam",
    description:
      "Tim legal Anda menghabiskan 2-3 jam per kontrak untuk review manual. Dengan puluhan kontrak setiap bulan, itu waktu yang bisa digunakan untuk hal strategis.",
  },
  {
    number: "02",
    title: "Karyawan menandatangani tanpa benar-benar membaca",
    description:
      "Platform e-signature membuat proses terlalu mudah — klik, tanda tangan, selesai. Tidak ada jaminan penandatangan memahami isi kontrak yang mereka setujui.",
  },
  {
    number: "03",
    title: "Risiko sengketa karena kurangnya informed consent",
    description:
      "Jika salah satu pihak mengklaim tidak memahami isi kontrak, perusahaan Anda yang menanggung beban pembuktian. Tanpa bukti informed consent, posisi hukum melemah.",
  },
] as const;

export const B2B_SOLUTIONS = [
  {
    title: "Analisis AI Otomatis",
    description:
      "Upload kontrak dan dapatkan analisis risiko per klausa dalam hitungan detik. AI kami membandingkan setiap pasal dengan 121.000+ regulasi Indonesia yang aktif.",
    detail: "Hemat hingga 90% waktu review kontrak",
  },
  {
    title: "Kirim dan Tanda Tangan Bersama",
    description:
      "Kirim dokumen ke pihak manapun untuk ditinjau dan ditandatangani secara digital. Lacak status penandatanganan secara real-time dari satu dashboard.",
    detail: "Multi-party signing dengan audit trail lengkap",
  },
  {
    title: "Analisis Ditanggung Perusahaan",
    description:
      "Aktifkan fitur 'Company Pays' saat mengirim kontrak — penerima bisa menjalankan analisis AI tanpa biaya dari kuota mereka. Transparansi yang melindungi bisnis Anda.",
    detail: "Bukti informed consent untuk kedua belah pihak",
  },
  {
    title: "Dashboard dan Manajemen Tim",
    description:
      "Kelola semua dokumen, pantau status penandatanganan, dan atur akses tim dari satu tempat. Ekspor audit trail kapan saja untuk keperluan compliance.",
    detail: "Kontrol penuh untuk tim legal Anda",
  },
] as const;

export const B2B_HOW_IT_WORKS = [
  {
    number: 1,
    title: "Upload dan Analisis",
    description:
      "Tim Anda mengunggah kontrak. AI menganalisis setiap klausa dan memberikan skor risiko berdasarkan hukum Indonesia yang berlaku.",
  },
  {
    number: 2,
    title: "Kirim ke Pihak Terkait",
    description:
      "Tambahkan email penerima dan aktifkan analisis gratis jika diperlukan. Penerima mendapat notifikasi dengan link ke dokumen.",
  },
  {
    number: 3,
    title: "Review dan Tanda Tangan",
    description:
      "Penerima membaca analisis AI, memahami risiko setiap klausa, lalu menandatangani secara digital dengan penuh kesadaran.",
  },
  {
    number: 4,
    title: "Dokumen Final Tersimpan",
    description:
      "Setelah semua pihak menandatangani, dokumen final dengan sertifikat digital tersedia untuk diunduh. Audit trail tercatat lengkap.",
  },
] as const;

export const B2B_PRICING_PLANS = [
  {
    name: "Starter",
    price: "Rp 499.000",
    period: "Per bulan",
    description: "Untuk tim kecil yang mulai mendigitalkan proses kontrak",
    included: [
      "Tanda tangan digital unlimited",
      "250 analisis AI per bulan",
      "Hingga 5 anggota tim",
      "Kirim dokumen dan co-sign",
      'Fitur "Company Pays" analysis',
      "Dashboard basic",
      "Audit trail basic",
    ],
    excluded: [
      "Template library",
      "Bulk upload",
      "Custom branding",
      "API access",
    ],
    cta: "Pilih Starter Bisnis",
    ctaHref: "/checkout/?account_type=business&target_plan=plus&source=bisnis",
    primary: false,
  },
  {
    name: "Business",
    price: "Rp 1.500.000",
    period: "Per bulan",
    description: "Untuk perusahaan dengan volume kontrak tinggi",
    included: [
      "Tanda tangan digital unlimited",
      "1.000 analisis AI per bulan",
      "Hingga 20 anggota tim",
      "Kirim dokumen dan co-sign",
      'Fitur "Company Pays" analysis',
      "Dashboard lengkap dengan analytics",
      "Audit trail dan compliance log",
      "Template library",
      "Bulk upload",
    ],
    excluded: ["Custom branding", "API access"],
    cta: "Pilih Paket Bisnis",
    ctaHref: "/checkout/?account_type=business&target_plan=business&source=bisnis",
    primary: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "Hubungi kami",
    description: "Untuk organisasi besar dengan kebutuhan khusus",
    included: [
      "Tanda tangan digital unlimited",
      "Analisis AI unlimited",
      "Anggota tim unlimited",
      "Semua fitur Business",
      "Custom branding",
      "API access",
      "SLA dan dedicated support",
      "Integrasi sistem internal",
    ],
    excluded: [],
    cta: "Hubungi Kami",
    ctaHref: "mailto:hello@tanyahukum.dev",
    primary: false,
  },
] as const;

export const B2B_USE_CASES = [
  {
    industry: "Startup dan Teknologi",
    description:
      "Kontrak kerja PKWT, NDA, perjanjian investasi — semua bisa dianalisis dan ditandatangani dalam satu platform. Cocok untuk proses onboarding karyawan baru.",
  },
  {
    industry: "Jasa Keuangan",
    description:
      "Perjanjian kredit, syarat dan ketentuan produk, akad pembiayaan — pastikan kepatuhan terhadap regulasi OJK dan Bank Indonesia sebelum klien menandatangani.",
  },
  {
    industry: "Properti dan Real Estate",
    description:
      "Perjanjian sewa, jual beli, dan kontrak pembangunan — lindungi kedua belah pihak dengan analisis risiko yang transparan dan tanda tangan digital yang tercatat.",
  },
  {
    industry: "Konsultan dan Law Firm",
    description:
      "Pre-screening kontrak klien secara otomatis sebelum review manual. Hemat waktu tim legal untuk fokus pada kasus yang membutuhkan analisis mendalam.",
  },
] as const;

export const B2B_STATS = [
  { value: "121.000+", label: "Regulasi dalam database" },
  { value: "15 detik", label: "Rata-rata waktu analisis" },
  { value: "90%", label: "Waktu review yang dihemat" },
  { value: "4.800+", label: "Peraturan hukum tercakup" },
] as const;

export const B2B_FAQ = [
  {
    question: "Apakah tanda tangan digital TanyaHukum sah secara hukum?",
    answer:
      "Tanda tangan elektronik diakui secara hukum berdasarkan UU ITE No. 11/2008 dan PP 71/2019 tentang PSTE. Saat ini TanyaHukum menggunakan consent-based e-signature dengan audit trail lengkap. Sertifikasi PSrE dari Kominfo ada dalam roadmap pengembangan kami.",
  },
  {
    question:
      'Bagaimana cara kerja fitur "Company Pays" untuk analisis AI?',
    answer:
      'Saat mengirim dokumen untuk ditandatangani, Anda bisa mengaktifkan opsi "Company Pays". Artinya penerima bisa menjalankan analisis AI pada dokumen tersebut tanpa mengurangi kuota pribadi mereka — biayanya ditanggung dari kuota perusahaan Anda.',
  },
  {
    question: "Apakah data kontrak kami aman?",
    answer:
      "Keamanan data adalah prioritas utama. Kami menggunakan enkripsi end-to-end, server berlokasi di Indonesia, dan mematuhi UU PDP No. 27/2022. Dokumen yang diupload tidak digunakan untuk training model AI.",
  },
  {
    question: "Bisa diintegrasikan dengan sistem internal kami?",
    answer:
      "Paket Enterprise menyediakan API access untuk integrasi dengan HRIS, document management system, atau platform internal lainnya. Tim kami akan membantu proses integrasi sesuai kebutuhan teknis Anda.",
  },
  {
    question: "Berapa lama proses onboarding tim?",
    answer:
      "Tidak ada proses onboarding yang rumit. Tim Anda bisa langsung menggunakan platform setelah registrasi. Untuk paket Enterprise, kami menyediakan sesi onboarding khusus dan dedicated support.",
  },
  {
    question: "Apakah ada masa percobaan gratis?",
    answer:
      "Anda bisa mencoba fitur analisis AI melalui halaman Cek Dokumen tanpa registrasi. Untuk fitur lengkap termasuk tanda tangan digital dan manajemen tim, hubungi kami untuk demo dan trial period.",
  },
] as const;
