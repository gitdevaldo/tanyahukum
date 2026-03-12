import { Button } from "@/components/ui";

export default function Hero() {
  return (
    <section id="home" className="bg-light-cream px-[5%] pt-12 pb-16 sm:pt-20 sm:pb-24 relative overflow-hidden">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-8 lg:gap-16 lg:grid-cols-2">
        {/* Left content */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight text-dark-navy mb-4 sm:mb-6 lg:text-5xl">
            Pahami Kontrak Anda Sebelum Tanda Tangan dengan{" "}
            <span className="text-primary-orange">TanyaHukum AI</span>
          </h1>

          <div className="rounded-xl bg-dark-navy p-5 sm:p-8 text-white max-w-lg">
            <p className="mb-4 sm:mb-6 leading-relaxed text-sm sm:text-base">
              Unggah dokumen kontrak Anda dan biarkan AI kami menganalisis setiap
              klausul berdasarkan regulasi Indonesia yang sebenarnya. Dapatkan
              peringatan risiko, penjelasan hukum, dan konsultasi langsung dengan
              pengacara profesional.
            </p>
            <Button href="/cek-dokumen/" size="lg">
              Coba Sekarang
            </Button>
          </div>
        </div>

        {/* Right visual — animated SVG */}
        <div className="hidden justify-center items-center lg:flex">
          <img
            src="/hero-animation.svg"
            alt="TanyaHukum AI illustration"
            className="w-full max-w-[500px] h-auto"
          />
        </div>
      </div>
    </section>
  );
}
