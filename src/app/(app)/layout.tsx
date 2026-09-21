import { can, ROLE_LABELS, type Permission } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { NavLinks } from "@/components/nav-links";
import { logoutAction } from "./actions";

const NAV: { href: string; label: string; permission?: Permission }[] = [
  { href: "/", label: "Tableau de bord" },
  { href: "/devis", label: "Devis", permission: "quotes:read" },
  { href: "/factures", label: "Factures", permission: "invoices:read" },
  { href: "/livraisons", label: "Livraisons", permission: "delivery:read" },
  { href: "/stock", label: "Stock", permission: "stock:read" },
  { href: "/chantiers", label: "Chantiers", permission: "projects:read" },
  { href: "/recurrentes", label: "Récurrentes", permission: "recurring:read" },
  { href: "/paiements", label: "Paiements", permission: "payments:read" },
  { href: "/relances", label: "Relances", permission: "payments:read" },
  { href: "/clients", label: "Clients", permission: "customers:read" },
  { href: "/produits", label: "Produits et services", permission: "products:read" },
  { href: "/rapports", label: "Rapports", permission: "reports:read" },
  { href: "/parametres", label: "Paramètres", permission: "settings:read" },
  { href: "/utilisateurs", label: "Utilisateurs", permission: "users:manage" },
  { href: "/audit", label: "Journal d'audit", permission: "audit:read" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const links = NAV.filter((l) => !l.permission || can(user.role, l.permission));

  return (
    <div className="min-h-screen md:flex">
      <aside className="md:w-60 md:min-h-screen p-4 no-print border-b md:border-b-0 md:border-r" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center gap-2 mb-5 no-print">
          <span className="brand-mark" aria-hidden="true">F</span>
          <p className="text-lg font-semibold">Facturation</p>
        </div>
        <NavLinks links={links.map(({ href, label }) => ({ href, label }))} />
        <div className="mt-6 text-sm space-y-2">
          <p className="font-medium">{user.name}</p>
          <p style={{ color: "var(--muted)" }}>{ROLE_LABELS[user.role]}</p>
          <form action={logoutAction}>
            <button className="btn btn-ghost text-sm">Se déconnecter</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8 min-w-0">{children}</main>
    </div>
  );
}
