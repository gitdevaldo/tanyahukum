import { TRUST_PARTNERS } from "@/lib/constants";

export default function TrustBar() {
  return (
    <section className="border-b border-border-light bg-white px-[5%] py-8">
      <div className="mx-auto max-w-[1400px] text-center">
        <p className="mb-4 text-neutral-gray">
          Dipercaya oleh ribuan pengguna di Indonesia
        </p>
        <div className="flex flex-wrap items-center justify-center gap-12">
          {TRUST_PARTNERS.map((name) => (
            <div
              key={name}
              className="flex items-center gap-2 text-lg font-semibold text-neutral-gray"
            >
              <div className="h-[30px] w-[30px] rounded bg-neutral-gray" />
              <span>{name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
