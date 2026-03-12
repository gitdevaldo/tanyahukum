import { Button } from "@/components/ui";
import { HOW_IT_WORKS_STEPS } from "@/lib/constants";

export default function HowItWorks() {
  return (
    <section className="bg-white px-[5%] py-14 sm:py-24">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 lg:gap-16 lg:grid-cols-2">
        {/* Left */}
        <div>
          <h2 className="mb-3 sm:mb-4 text-3xl sm:text-4xl font-bold text-dark-navy">
            Cara Kerja
          </h2>
          <p className="mb-6 sm:mb-8 text-base sm:text-lg text-neutral-gray">
            Analisis kontrak hukum dalam 3 langkah sederhana — tidak perlu
            background hukum, AI kami yang mengerjakan semuanya.
          </p>
          <Button href="/cek-dokumen/" variant="secondary">
            Coba Sekarang
          </Button>
        </div>

        {/* Right — steps */}
        <div className="rounded-xl bg-dark-navy p-6 sm:p-12 text-white">
          {HOW_IT_WORKS_STEPS.map((step, i) => (
            <div
              key={step.number}
              className={`py-5 sm:py-8 ${i < HOW_IT_WORKS_STEPS.length - 1 ? "border-b border-white/10" : ""}`}
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
