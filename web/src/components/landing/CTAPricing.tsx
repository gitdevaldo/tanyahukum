import { Button } from "@/components/ui";
import { PRICING_PLANS } from "@/lib/constants";

export default function CTAPricing() {
  return (
    <section id="pricing" className="bg-dark-navy px-[5%] py-14 sm:py-24 text-white">
      <div className="mx-auto max-w-[1400px] text-center">
        <h2 className="mb-3 sm:mb-4 text-3xl sm:text-4xl font-bold">
          Bergabung dengan Ribuan Profesional Hukum yang Sudah Bekerja Lebih
          Cerdas
        </h2>
        <p className="mx-auto mb-8 sm:mb-12 max-w-[800px] text-base sm:text-lg text-muted-text">
          Dari freelancer hingga law firm, TanyaHukum membantu siapapun memahami
          hukum dengan lebih cepat dan akurat.
        </p>

        <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.name}
              className="flex flex-col rounded-xl bg-white p-6 sm:p-10 text-left text-dark-navy"
            >
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <div className="my-3 sm:my-4 text-3xl sm:text-4xl font-extrabold text-primary-orange">
                {plan.price}
              </div>
              <p className="text-neutral-gray">{plan.period}</p>
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
              {plan.disabled ? (
                <button
                  disabled
                  className="mt-6 w-full rounded-lg bg-gray-200 py-3 font-semibold text-gray-400 cursor-not-allowed"
                >
                  {plan.cta}
                </button>
              ) : (
                <Button
                  href={plan.ctaHref || "#"}
                  variant={plan.primary ? "primary" : "secondary"}
                  fullWidth
                  className="mt-6"
                >
                  {plan.cta}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
