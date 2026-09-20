import Link from "next/link";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listCustomers } from "@/lib/customers";
import { Flash, PageHeader, Pagination, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; inactive?: string; ok?: string; error?: string }>;
}) {
  const user = await requirePermission("customers:read");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const includeInactive = sp.inactive === "1";
  const { rows, total, pageSize } = await listCustomers(db, { q: sp.q, page, includeInactive });
  const qs = (p: number) =>
    `/clients?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(includeInactive ? { inactive: "1" } : {}), page: String(p) })}`;

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Clients"
        action={can(user.role, "customers:write") ? { href: "/clients/nouveau", label: "Nouveau client" } : undefined}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form className="flex flex-wrap gap-2 items-center">
        <input className="input !w-72" name="q" defaultValue={sp.q} placeholder="Rechercher (nom, code, matricule, e-mail)" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="inactive" value="1" defaultChecked={includeInactive} /> Inclure les inactifs
        </label>
        <button className="btn btn-ghost">Filtrer</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Code</th><th className="p-3">Nom</th><th className="p-3">Matricule fiscal</th>
              <th className="p-3">Ville</th><th className="p-3">Contact</th><th className="p-3">État</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 font-mono">{c.code}</td>
                <td className="p-3"><Link className="underline" href={`/clients/${c.id}`}>{c.name}</Link></td>
                <td className="p-3">{c.matriculeFiscal ?? "—"}</td>
                <td className="p-3">{c.city ?? "—"}</td>
                <td className="p-3">{c.email ?? c.phone ?? "—"}</td>
                <td className="p-3"><StatusBadge active={c.isActive} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-3" colSpan={6} style={{ color: "var(--muted)" }}>Aucun client.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} href={qs} />
    </div>
  );
}
