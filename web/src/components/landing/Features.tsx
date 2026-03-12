import { Button, SectionHeading } from "@/components/ui";
import { FEATURES } from "@/lib/constants";

export default function Features() {
  return (
    <section id="features" className="bg-white px-[5%] py-14 sm:py-24">
      <div className="mx-auto max-w-[1400px]">
        <SectionHeading
          title="AI yang Bekerja Seperti Anda"
          subtitle="Legal Research, AI-Powered Contracts, and Compliance — dengan teknologi machine learning terdepan dan database hukum Indonesia terlengkap."
        />

        <div className="mb-8 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl bg-dark-navy p-6 sm:p-10 text-white"
            >
              <div className="mb-4 sm:mb-6 flex h-12 w-12 sm:h-[60px] sm:w-[60px] items-center justify-center rounded-full bg-primary-orange text-2xl sm:text-3xl">
                {feature.icon}
              </div>
              <h3 className="mb-4 text-xl font-bold">{feature.title}</h3>
              <p className="leading-relaxed text-muted-text">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <Button href="#" variant="secondary">
            Pelajari Lebih Lanjut
          </Button>
        </div>
      </div>
    </section>
  );
}
