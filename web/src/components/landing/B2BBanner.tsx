import { Button } from "@/components/ui";

export default function B2BBanner() {
  return (
    <section className="bg-dark-navy px-[5%] py-10 sm:py-14">
      <div className="mx-auto max-w-[1400px] grid grid-cols-1 items-center gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Butuh solusi untuk tim atau perusahaan?
          </h2>
          <p className="text-muted-text text-sm sm:text-base">
            Kirim kontrak ke karyawan dan mitra dengan analisis AI — tanda
            tangan digital unlimited, dashboard, dan audit trail lengkap.
          </p>
        </div>
        <div className="flex-shrink-0">
          <Button href="/bisnis/" variant="outline" size="md">
            Pelajari TanyaHukum Bisnis
          </Button>
        </div>
      </div>
    </section>
  );
}
