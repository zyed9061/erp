import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";

const TABS = [
  { href: "/parametres", label: "Société" },
  { href: "/parametres/taxes", label: "Taxes" },
  { href: "/parametres/conditions", label: "Conditions de paiement" },
  { href: "/parametres/numerotation", label: "Numérotation" },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("settings:read");
  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-semibold">Paramètres</h1>
      <nav className="flex gap-1 flex-wrap border-b" style={{ borderColor: "var(--border)" }}>
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="px-3 py-2 text-sm rounded-t-md hover:bg-[var(--surface)]">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
