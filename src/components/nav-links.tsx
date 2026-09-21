"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Icônes 24×24 (tracé simple, style « contour »), une par entrée du menu.
const ICONS: Record<string, string> = {
  "/": "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  "/devis": "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  "/factures": "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  "/livraisons": "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  "/stock": "M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8",
  "/chantiers": "M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6",
  "/recurrentes": "M4 12a8 8 0 0113.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 01-13.7 5.6L4 15M4 20v-5h5",
  "/paiements": "M3 6h18v12H3zM3 10h18M7 15h3",
  "/relances": "M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 004 0",
  "/clients": "M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7M21 20v-1a4 4 0 00-3-3.9M15 4.2a3.5 3.5 0 010 6.6",
  "/produits": "M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8M12 13v8",
  "/rapports": "M4 20V10M10 20V4M16 20v-7M22 20H2",
  "/parametres": "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  "/utilisateurs": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  "/audit": "M8 3h9a2 2 0 012 2v14a2 2 0 01-2 2H8zM8 3a2 2 0 00-2 2v14a2 2 0 002 2M11 8h5M11 12h5M11 16h3",
};

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0" aria-label="Navigation principale">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="nav-link whitespace-nowrap" aria-current={isActive(l.href) ? "page" : undefined}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICONS[l.href] ?? ICONS["/"]} />
          </svg>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
