import { SectionHeading } from "@/components/ui";

export default function Demo() {
  return (
    <section className="bg-light-cream px-[5%] py-14 sm:py-24">
      <div className="mx-auto max-w-[1400px] text-center">
        <SectionHeading
          title="Lihat TanyaHukum AI dalam Aksi"
          subtitle="Contoh nyata bagaimana AI kami menganalisis kontrak dan menemukan klausul bermasalah yang terlewatkan oleh mata manusia."
        />

        <div className="flex h-[250px] sm:h-[400px] items-center justify-center rounded-xl bg-gradient-to-br from-[#2C5F2D] to-[#97BC62] text-xl sm:text-2xl text-white">
          [Demo Video / Interactive Preview]
        </div>
      </div>
    </section>
  );
}
