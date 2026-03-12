import Link from "next/link";
import { FOOTER_SECTIONS } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="bg-dark-navy px-[5%] pt-10 sm:pt-16 pb-8 text-white">
      <div className="mx-auto mb-10 sm:mb-12 grid max-w-[1400px] grid-cols-2 gap-8 sm:gap-12 md:grid-cols-4">
        {/* Brand */}
        <div className="col-span-2 md:col-span-1">
          <div className="mb-4">
            <img src="/logo.svg" alt="TanyaHukum" className="h-10 sm:h-12" />
          </div>
          <p className="leading-relaxed text-[#9CA3AF]">
            AI-powered legal assistant yang membantu masyarakat Indonesia
            memahami kontrak dan dokumen hukum dengan lebih mudah, cepat, dan
            akurat.
          </p>
        </div>

        {/* Link columns */}
        {FOOTER_SECTIONS.map((section) => (
          <div key={section.title}>
            <h4 className="mb-4 text-lg font-bold">{section.title}</h4>
            <ul className="space-y-2">
              {section.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-muted-text hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom */}
      <div className="border-t border-white/10 pt-8 text-center">
        <div className="font-heading text-3xl sm:text-5xl font-extrabold text-primary-orange">
          TH
        </div>
        <p className="mt-4 text-[#9CA3AF]">
          © 2026 TanyaHukum. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
