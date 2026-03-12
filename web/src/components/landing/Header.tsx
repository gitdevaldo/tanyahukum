import Link from "next/link";
import { Button } from "@/components/ui";
import { NAV_LINKS } from "@/lib/constants";

export default function Header() {
  return (
    <header className="bg-light-cream border-b border-border-light px-[5%] py-3 sm:py-4">
      <nav className="mx-auto flex max-w-[1400px] items-center justify-between">
        <div>
          <img src="/logo.svg" alt="TanyaHukum" className="h-10 sm:h-12" />
        </div>
        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="font-medium text-dark-navy hover:text-primary-orange transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <Button href="/cek-dokumen/" variant="primary" size="sm">
              Cek Dokumen
            </Button>
          </li>
        </ul>
        {/* Mobile CTA button */}
        <div className="md:hidden">
          <Button href="/cek-dokumen/" variant="primary" size="sm">
            Cek Dokumen
          </Button>
        </div>
      </nav>
    </header>
  );
}
