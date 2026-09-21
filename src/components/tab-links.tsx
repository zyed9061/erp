"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Onglets de navigation avec l'onglet courant mis en évidence (page exacte, ou sous-page pour les onglets non racines). */
export function TabLinks({ tabs, label }: { tabs: { href: string; label: string; root?: boolean }[]; label: string }) {
  const pathname = usePathname();
  const active = (t: { href: string; root?: boolean }) => (t.root ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`));
  return (
    <nav className="flex gap-1 flex-wrap border-b" style={{ borderColor: "var(--border)" }} aria-label={label}>
      {tabs.map((t) => (
        <Link
          key={t.href} href={t.href} aria-current={active(t) ? "page" : undefined}
          className="px-3 py-2 text-sm rounded-t-md hover:bg-[var(--surface)] border-b-2 border-transparent -mb-px aria-[current=page]:border-[var(--accent)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--accent)]"
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
