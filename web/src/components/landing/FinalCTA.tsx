import { Button } from "@/components/ui";

export default function FinalCTA() {
  return (
    <section className="bg-light-cream px-[5%] py-14 sm:py-24 text-dark-navy">
      <div className="mx-auto max-w-[1400px] text-center">
        <h2 className="mb-6 sm:mb-8 text-3xl sm:text-4xl font-bold text-dark-navy">
          Sudah 5 Affiliates Aktif yang Membantu Orang Indonesia Memahami Hukum
          dengan Lebih Baik
        </h2>
        <p className="mx-auto mb-8 max-w-[900px] text-neutral-gray">
          Kami membantu lebih dari 10,000 pengguna setiap bulannya untuk membaca
          dan memahami kontrak mereka — sebelum terlambat. Jangan biarkan dokumen
          hukum yang rumit menghalangi kesuksesan Anda.
        </p>
        <Button href="/cek-dokumen/" size="lg">
          Mulai Analisis Gratis
        </Button>
      </div>
    </section>
  );
}
