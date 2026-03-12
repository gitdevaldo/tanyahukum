import { COMPLIANCE_ITEMS } from "@/lib/constants";

export default function Compliance() {
  return (
    <section className="bg-amber px-[5%] py-14 sm:py-24">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-8 lg:gap-16 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 sm:mb-8 text-3xl sm:text-4xl font-bold text-dark-navy">
            Keamanan Data? Kepatuhan Regulasi? Sepenuhnya Terlindungi.
          </h2>
          <p className="text-base sm:text-lg text-dark-navy/80">
            TanyaHukum dibangun dengan standar keamanan tertinggi dan mematuhi
            seluruh regulasi perlindungan data Indonesia.
          </p>
        </div>

        <ul className="space-y-0">
          {COMPLIANCE_ITEMS.map((item) => (
            <li
              key={item}
              className="flex items-center gap-3 sm:gap-4 py-3 sm:py-4 text-base sm:text-lg text-dark-navy"
            >
              <span className="h-6 w-6 flex-shrink-0 rounded-full bg-primary-orange" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
