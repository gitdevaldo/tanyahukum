"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui";
import { NAV_LINKS } from "@/lib/constants";

// Pages that have #fitur and #pricing sections
const PAGES_WITH_SECTIONS = ["/", "/bisnis"];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Strip trailing slash for comparison
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const hasLocalSections = PAGES_WITH_SECTIONS.includes(normalizedPath);

  function getHref(link: (typeof NAV_LINKS)[number]) {
    if ("href" in link && link.href) return link.href;
    if ("anchor" in link && link.anchor) {
      // If current page has the section, scroll in-page; otherwise go to homepage
      return hasLocalSections ? `#${link.anchor}` : `/#${link.anchor}`;
    }
    return "/";
  }

  return (
    <header className="bg-light-cream border-b border-border-light px-[5%] py-3 sm:py-4">
      <nav className="mx-auto flex max-w-[1400px] items-center justify-between">
        <Link href="/" className="flex-shrink-0">
          <img src="/logo.svg" alt="TanyaHukum" className="h-10 sm:h-12" />
        </Link>

        {/* Center nav links */}
        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <Link
                href={getHref(link)}
                className="font-medium text-dark-navy hover:text-primary-orange transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right CTA */}
        <div className="hidden md:flex items-center gap-2">
          <Button href="/bisnis/" variant="secondary" size="sm">
            Bisnis
          </Button>
          <Button href="/cek-dokumen/" variant="primary" size="sm">
            Cek Dokumen
          </Button>
        </div>

        {/* Mobile */}
        <div className="md:hidden flex items-center gap-2">
          <Button href="/cek-dokumen/" variant="primary" size="sm" className="!px-3 !py-1.5 !text-xs">
            Cek Dokumen
          </Button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 text-dark-navy"
            aria-label="Toggle navigation menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </nav>
      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden mt-3 pb-3 border-t border-border-light pt-3">
          <ul className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={getHref(link)}
                  onClick={() => setMenuOpen(false)}
                  className="block font-medium text-dark-navy hover:text-primary-orange transition-colors py-1"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-border-light flex flex-col gap-2">
            <Button href="/bisnis/" variant="secondary" size="sm" className="w-full text-center">
              Bisnis
            </Button>
            <Button href="/cek-dokumen/" variant="primary" size="sm" className="w-full text-center">
              Cek Dokumen
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
