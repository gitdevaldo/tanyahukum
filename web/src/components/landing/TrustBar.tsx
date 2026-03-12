import { STATS_BAR } from "@/lib/constants";

export default function TrustBar() {
  return (
    <section className="border-b border-border-light bg-white px-[5%] py-10 sm:py-12">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid grid-cols-2 gap-8 sm:gap-6 md:grid-cols-4">
          {STATS_BAR.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-dark-navy mb-1">
                {stat.value}
              </p>
              <p className="text-neutral-gray text-sm sm:text-base">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
