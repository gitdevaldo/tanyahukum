import { SectionHeading } from "@/components/ui";
import { FAQ_ITEMS } from "@/lib/constants";

export default function FAQ() {
  return (
    <section id="faq" className="bg-dark-navy px-[5%] py-14 sm:py-24 text-white">
      <div className="mx-auto max-w-[1400px]">
        <SectionHeading title="Pertanyaan yang Sering Diajukan" light />

        <div className="grid grid-cols-1 gap-8 sm:gap-12 md:grid-cols-2">
          {FAQ_ITEMS.map((item) => (
            <div key={item.question}>
              <h3 className="mb-2 sm:mb-4 text-lg sm:text-xl font-bold">{item.question}</h3>
              <p className="leading-relaxed text-sm sm:text-base text-muted-text">{item.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
