import Link from "next/link";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatPercent, formatTnd } from "@/lib/money";
import { listProducts } from "@/lib/products";
import { Flash, PageHeader, Pagination, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; inactive?: string; ok?: string; error?: string }>;
}) {
  const user = await requirePermission("products:read");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const includeInactive = sp.inactive === "1";
  const { rows, total, pageSize } = await listProducts(db, { q: sp.q, page, includeInactive });
  const qs = (p: number) =>
    `/produits?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(includeInactive ? { inactive: "1" } : {}), page: String(p) })}`;

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Produits et services"
        action={can(user.role, "products:write") ? { href: "/produits/nouveau", label: "Nouvel article" } : undefined}
      />
      <Flash ok={sp.ok} error={sp.error} />
      <form className="flex flex-wrap gap-2 items-center">
        <input className="input !w-72" name="q" defaultValue={sp.q} placeholder="Rechercher (désignation, code)" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="inactive" value="1" defaultChecked={includeInactive} /> Inclure les inactifs
        </label>
        <button className="btn btn-ghost">Filtrer</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Code</th><th className="p-3">Désignation</th><th className="p-3">Type</th>
              <th className="p-3 text-right">Prix HT</th><th className="p-3">TVA</th><th className="p-3">FODEC</th><th className="p-3">État</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ product: p, tvaRate }) => (
              <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 font-mono">{p.code}</td>
                <td className="p-3"><Link className="underline" href={`/produits/${p.id}`}>{p.name}</Link></td>
                <td className="p-3">{p.type === "bien" ? "Bien" : "Service"}</td>
                <td className="p-3 text-right whitespace-nowrap">{formatTnd(p.unitPrice)} / {p.unit}</td>
                <td className="p-3">{formatPercent(tvaRate)}</td>
                <td className="p-3">{p.fodecApplicable ? "Oui" : "—"}</td>
                <td className="p-3"><StatusBadge active={p.isActive} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-3" colSpan={7} style={{ color: "var(--muted)" }}>Aucun article.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} href={qs} />
    </div>
  );
}
