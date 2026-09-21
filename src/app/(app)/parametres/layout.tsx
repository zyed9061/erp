import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { TabLinks } from "@/components/tab-links";

const TABS = [
  { href: "/parametres", label: "Société", root: true },
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
      <TabLinks label="Paramètres" tabs={TABS.filter((t) => !("admin" in t) || isAdmin).map(({ href, label, root }) => ({ href, label, root }))} />
      {children}
    </div>
  );
}
