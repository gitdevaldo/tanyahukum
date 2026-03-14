import { Button, SectionHeading } from "@/components/ui";

export default function PricingComparison() {
  return (
    <section className="bg-light-cream px-[5%] py-14 sm:py-24">
      <div className="mx-auto max-w-[1400px]">
        <SectionHeading title="Analisis Kontrak AI + Tanda Tangan Digital — Lebih Murah dari Konsultasi Pengacara" />

        <div className="rounded-xl bg-white p-6 sm:p-12 shadow-lg">
          <div className="grid grid-cols-1 items-center gap-8 sm:gap-12 lg:grid-cols-2">
            <div>
              <p className="mb-4 text-sm sm:text-base text-neutral-gray">
                Konsultasi pengacara tradisional untuk review kontrak sederhana
                bisa mencapai Rp 2-5 juta. Dengan TanyaHukum, Anda mendapatkan
                analisis AI + tanda tangan digital mulai dari:
              </p>
              <div className="text-4xl sm:text-5xl font-extrabold text-primary-orange">
                Rp 29.000
                <span className="text-lg sm:text-xl font-normal text-neutral-gray">
                  /bulan
                </span>
              </div>
              <p className="mt-2 text-neutral-gray">
                Tanda tangan unlimited + 10 analisis AI/bulan
              </p>
            </div>
            <div>
              <Button href="/checkout/?account_type=personal&target_plan=starter&source=landing" size="lg" fullWidth>
                Pilih Starter
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
