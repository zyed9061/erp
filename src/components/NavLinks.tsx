"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

const links = [
  { href: "/", label: "Tableau de bord" },
  { href: "/clients", label: "Clients" },
  { href: "/produits", label: "Produits & Services" },
  { href: "/devis", label: "Devis" },
  { href: "/factures", label: "Factures" },
  { href: "/avoirs", label: "Avoirs" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="-mx-1 flex items-center gap-0.5 overflow-x-auto px-1 text-sm">
      {links.map((link) => {
        const actif =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={actif ? "page" : undefined}
            className={`relative shrink-0 rounded-lg px-3 py-1.5 transition-colors duration-200 ${
              actif ? "text-violet-700" : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {actif && (
              <motion.span
                layoutId="nav-actif"
                className="absolute inset-0 rounded-lg bg-violet-50 ring-1 ring-inset ring-violet-200/70"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
