import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";

const TABS = [
  { href: "/parametres", label: "Société" },
  { href: "/parametres/taxes", label: "Taxes" },
  { href: "/parametres/conditions", label: "Conditions de paiement" },
  { href: "/parametres/numerotation", label: "Numérotation" },
  { href: "/parametres/relances", label: "Relances" },
  { href: "/parametres/configuration", label: "Configuration", admin: true },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("settings:read");
  const isAdmin = can(user.role, "settings:manage");
  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-semibold">Paramètres</h1>
      <nav className="flex gap-1 flex-wrap border-b" style={{ borderColor: "var(--border)" }}>
        {TABS.filter((t) => !("admin" in t) || isAdmin).map((t) => (
          <Link key={t.href} href={t.href} className="px-3 py-2 text-sm rounded-t-md hover:bg-[var(--surface)]">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
