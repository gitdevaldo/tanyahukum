import { Button } from "@/components/ui";

const B2B_HIGHLIGHTS = [
  {
    title: "Analisis AI Otomatis",
    description:
      "Setiap kontrak dianalisis per klausa dan dibandingkan dengan 121.000+ regulasi Indonesia yang aktif.",
  },
  {
    title: "Tanda Tangan Digital Unlimited",
    description:
      "Kirim dokumen ke karyawan, mitra, atau klien untuk ditinjau dan ditandatangani secara digital.",
  },
  {
    title: "Company Pays",
    description:
      "Tanggung biaya analisis untuk penerima kontrak — bukti informed consent yang melindungi bisnis Anda.",
  },
];

export default function B2BBanner() {
  return (
    <section className="bg-dark-navy px-[5%] py-16 sm:py-20">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="text-center mb-10 sm:mb-14">
          <p className="text-primary-orange font-semibold text-sm sm:text-base mb-3 tracking-wide uppercase">
            Untuk Perusahaan
          </p>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4">
            Kelola Kontrak Tim Anda dengan{" "}
            <span className="text-primary-orange">Lebih Cerdas</span>
          </h2>
          <p className="text-muted-text text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Platform e-signature saja tidak cukup. TanyaHukum Bisnis memastikan
            setiap penandatangan memahami isi kontrak sebelum menandatangani —
            mengurangi risiko sengketa dan memperkuat posisi hukum perusahaan.
          </p>
        </div>

        {/* Highlights grid */}
        <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3 mb-10 sm:mb-14">
          {B2B_HIGHLIGHTS.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-white/10 bg-white/5 p-6 sm:p-8"
            >
              <h3 className="text-lg sm:text-xl font-bold text-white mb-3">
                {item.title}
              </h3>
              <p className="text-muted-text text-sm sm:text-base leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <Button href="/bisnis/" variant="primary" size="lg">
            Pelajari TanyaHukum Bisnis
          </Button>
          <p className="text-muted-text text-xs sm:text-sm mt-4">
            Mulai dari Rp499.000/bulan — tanda tangan digital unlimited untuk
            seluruh tim.
          </p>
        </div>
      </div>
    </section>
  );
}
