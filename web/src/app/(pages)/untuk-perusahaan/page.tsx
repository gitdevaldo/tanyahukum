import { Metadata } from "next";
import { Header, Footer } from "@/components/landing";
import { Button, SectionHeading } from "@/components/ui";
import {
  B2B_HERO,
  B2B_PROBLEMS,
  B2B_SOLUTIONS,
  B2B_HOW_IT_WORKS,
  B2B_PRICING_PLANS,
  B2B_USE_CASES,
  B2B_STATS,
  B2B_FAQ,
} from "@/lib/b2b-constants";

export const metadata: Metadata = {
  title: "TanyaHukum untuk Perusahaan — Analisis Kontrak AI & Tanda Tangan Digital",
  description:
    "Kirim kontrak dengan analisis AI ke karyawan dan mitra bisnis. Tanda tangan digital dengan bukti informed consent. Lindungi bisnis Anda.",
};

/* ─── Hero ─── */
function B2BHero() {
  return (
    <section className="bg-light-cream px-[5%] pt-12 pb-16 sm:pt-20 sm:pb-24">
      <div className="mx-auto max-w-[1400px]">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary-orange">
            {B2B_HERO.highlight}
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-dark-navy mb-4 sm:mb-6">
            {B2B_HERO.title}
          </h1>
          <p className="mb-6 sm:mb-8 text-base sm:text-lg text-neutral-gray leading-relaxed max-w-2xl">
            {B2B_HERO.description}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button href={B2B_HERO.ctaHref} size="lg">
              {B2B_HERO.cta}
            </Button>
            <Button href="mailto:hello@tanyahukum.dev" variant="secondary" size="lg">
              Hubungi Sales
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Stats Bar ─── */
function StatsBar() {
  return (
    <section className="bg-dark-navy px-[5%] py-10 sm:py-14">
      <div className="mx-auto max-w-[1400px] grid grid-cols-2 gap-6 sm:gap-8 md:grid-cols-4">
        {B2B_STATS.map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-2xl sm:text-3xl font-extrabold text-primary-orange">
              {stat.value}
            </div>
            <p className="mt-1 text-sm sm:text-base text-muted-text">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Problem Section ─── */
function Problems() {
  return (
    <section className="bg-white px-[5%] py-14 sm:py-24">
      <div className="mx-auto max-w-[1400px]">
        <SectionHeading
          title="Masalah yang Sering Diabaikan"
          subtitle="Tiga tantangan utama dalam pengelolaan kontrak perusahaan yang berdampak langsung pada risiko hukum dan efisiensi operasional."
        />
        <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
          {B2B_PROBLEMS.map((problem) => (
            <div
              key={problem.number}
              className="rounded-xl border-2 border-border-light p-6 sm:p-8"
            >
              <span className="text-3xl sm:text-4xl font-extrabold text-primary-orange/20">
                {problem.number}
              </span>
              <h3 className="mt-3 mb-3 text-lg font-bold text-dark-navy">
                {problem.title}
              </h3>
              <p className="leading-relaxed text-neutral-gray">
                {problem.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Solution Section ─── */
function Solutions() {
  return (
    <section className="bg-dark-navy px-[5%] py-14 sm:py-24 text-white">
      <div className="mx-auto max-w-[1400px]">
        <SectionHeading
          title="Satu Platform, Semua Kebutuhan Kontrak"
          subtitle="Dari analisis hingga tanda tangan — kelola seluruh siklus kontrak perusahaan Anda di satu tempat."
          light
        />
        <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
          {B2B_SOLUTIONS.map((solution) => (
            <div
              key={solution.title}
              className="rounded-xl bg-white/5 border border-white/10 p-6 sm:p-8"
            >
              <h3 className="mb-3 text-xl font-bold">{solution.title}</h3>
              <p className="mb-4 leading-relaxed text-muted-text">
                {solution.description}
              </p>
              <span className="inline-block rounded-full bg-primary-orange/15 px-4 py-1.5 text-sm font-medium text-primary-orange">
                {solution.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works ─── */
function HowItWorks() {
  return (
    <section className="bg-white px-[5%] py-14 sm:py-24">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 lg:gap-16 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 sm:mb-4 text-3xl sm:text-4xl font-bold text-dark-navy">
            Alur Kerja yang Sederhana
          </h2>
          <p className="mb-6 sm:mb-8 text-base sm:text-lg text-neutral-gray">
            Dari upload hingga tanda tangan, seluruh proses dirancang agar tim
            Anda bisa bekerja lebih cepat tanpa mengorbankan kepatuhan hukum.
          </p>
          <Button href="/cek-dokumen/" variant="secondary">
            Coba Sekarang
          </Button>
        </div>

        <div className="rounded-xl bg-dark-navy p-6 sm:p-12 text-white">
          {B2B_HOW_IT_WORKS.map((step, i) => (
            <div
              key={step.number}
              className={`py-5 sm:py-8 ${i < B2B_HOW_IT_WORKS.length - 1 ? "border-b border-white/10" : ""}`}
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary-orange font-bold">
                {step.number}
              </div>
              <h3 className="mb-2 text-lg font-bold">{step.title}</h3>
              <p className="text-muted-text">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Use Cases ─── */
function UseCases() {
  return (
    <section className="bg-light-cream px-[5%] py-14 sm:py-24">
      <div className="mx-auto max-w-[1400px]">
        <SectionHeading
          title="Digunakan di Berbagai Industri"
          subtitle="TanyaHukum membantu tim legal dari berbagai sektor mengelola kontrak dengan lebih efisien dan transparan."
        />
        <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
          {B2B_USE_CASES.map((useCase) => (
            <div
              key={useCase.industry}
              className="rounded-xl bg-white p-6 sm:p-8 shadow-sm"
            >
              <h3 className="mb-3 text-lg font-bold text-dark-navy">
                {useCase.industry}
              </h3>
              <p className="leading-relaxed text-neutral-gray">
                {useCase.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Company Pays Highlight ─── */
function CompanyPays() {
  return (
    <section className="bg-amber px-[5%] py-14 sm:py-24">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-8 lg:gap-16 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 sm:mb-6 text-3xl sm:text-4xl font-bold text-dark-navy">
            Analisis Gratis untuk Penerima,
            <br />
            Ketenangan untuk Pengirim
          </h2>
          <p className="text-base sm:text-lg text-dark-navy/80 leading-relaxed">
            Dengan fitur &ldquo;Company Pays&rdquo;, perusahaan Anda menanggung
            biaya analisis AI saat mengirim kontrak. Penerima mendapatkan
            transparansi penuh tanpa biaya — dan perusahaan Anda mendapatkan
            bukti bahwa setiap penandatangan benar-benar memahami isi kontrak.
          </p>
        </div>

        <div className="rounded-xl bg-dark-navy p-6 sm:p-8 text-white">
          <ul className="space-y-0">
            {[
              "Penerima analisis AI tanpa kuota pribadi",
              "Kuota analisis diambil dari akun perusahaan",
              "Bukti informed consent yang kuat secara hukum",
              "Badge transparansi di halaman review penerima",
              "Mengurangi risiko sengketa di kemudian hari",
              "Meningkatkan kepercayaan karyawan dan mitra",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-3 sm:gap-4 py-3 sm:py-4 text-base border-b border-white/10 last:border-0"
              >
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary-orange" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ─── */
function Pricing() {
  return (
    <section id="pricing" className="bg-dark-navy px-[5%] py-14 sm:py-24 text-white">
      <div className="mx-auto max-w-[1400px] text-center">
        <h2 className="mb-3 sm:mb-4 text-3xl sm:text-4xl font-bold">
          Paket yang Disesuaikan untuk Kebutuhan Bisnis
        </h2>
        <p className="mx-auto mb-8 sm:mb-12 max-w-[800px] text-base sm:text-lg text-muted-text">
          Semua paket sudah termasuk tanda tangan digital unlimited.
          Pilih berdasarkan volume analisis AI dan ukuran tim Anda.
        </p>

        <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
          {B2B_PRICING_PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-xl p-6 sm:p-10 text-left ${
                plan.primary
                  ? "bg-white text-dark-navy ring-2 ring-primary-orange"
                  : "bg-white text-dark-navy"
              }`}
            >
              {plan.primary && (
                <span className="mb-3 inline-block self-start rounded-full bg-primary-orange px-3 py-1 text-xs font-semibold text-white">
                  Paling Populer
                </span>
              )}
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <div className="my-3 sm:my-4 text-3xl sm:text-4xl font-extrabold text-primary-orange">
                {plan.price}
              </div>
              <p className="text-neutral-gray">{plan.period}</p>
              <p className="mt-2 text-sm text-neutral-gray">
                {plan.description}
              </p>

              <ul className="my-8 space-y-0 flex-1">
                {plan.included.map((feature) => (
                  <li
                    key={feature}
                    className="border-b border-border-light py-3 flex items-center gap-2"
                  >
                    <span className="text-green-500 flex-shrink-0">✓</span>
                    {feature}
                  </li>
                ))}
                {plan.excluded.map((feature) => (
                  <li
                    key={feature}
                    className="border-b border-border-light py-3 flex items-center gap-2 text-neutral-gray/50"
                  >
                    <span className="text-gray-300 flex-shrink-0">✕</span>
                    <span className="line-through">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                href={plan.ctaHref}
                variant={plan.primary ? "primary" : "secondary"}
                fullWidth
                className="mt-6"
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ─── */
function B2BFAQ() {
  return (
    <section className="bg-dark-navy px-[5%] py-14 sm:py-24 text-white">
      <div className="mx-auto max-w-[1400px]">
        <SectionHeading title="Pertanyaan Umum" light />

        <div className="grid grid-cols-1 gap-8 sm:gap-12 md:grid-cols-2">
          {B2B_FAQ.map((item) => (
            <div key={item.question}>
              <h3 className="mb-2 sm:mb-4 text-lg sm:text-xl font-bold">
                {item.question}
              </h3>
              <p className="leading-relaxed text-sm sm:text-base text-muted-text">
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA ─── */
function FinalCTA() {
  return (
    <section className="bg-light-cream px-[5%] py-14 sm:py-24 text-dark-navy">
      <div className="mx-auto max-w-[1400px] text-center">
        <h2 className="mb-4 sm:mb-6 text-3xl sm:text-4xl font-bold text-dark-navy">
          Siap Mengelola Kontrak Perusahaan dengan Lebih Cerdas?
        </h2>
        <p className="mx-auto mb-8 max-w-[700px] text-neutral-gray">
          Mulai dengan mencoba analisis dokumen — lihat sendiri bagaimana AI
          kami membantu tim legal bekerja lebih efisien. Tidak perlu registrasi
          untuk demo pertama.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button href="/cek-dokumen/" size="lg">
            Coba Analisis Dokumen
          </Button>
          <Button href="mailto:hello@tanyahukum.dev" variant="secondary" size="lg">
            Jadwalkan Demo
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ─── Page Composition ─── */
export default function UntukPerusahaanPage() {
  return (
    <>
      <Header />
      <B2BHero />
      <StatsBar />
      <Problems />
      <Solutions />
      <CompanyPays />
      <HowItWorks />
      <UseCases />
      <Pricing />
      <B2BFAQ />
      <FinalCTA />
      <Footer />
    </>
  );
}
