import Link from "next/link";
import { db } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { formatAmount } from "@/lib/money";
import { listStock } from "@/lib/stock";
import { Flash, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; low?: string; ok?: string; error?: string }>;
}) {
  await requirePermission("stock:read");
  const sp = await searchParams;
  const lowOnly = sp.low === "1";
  const { rows } = await listStock(db, { q: sp.q, lowOnly, pageSize: 500 });

  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader title="Stock" />
      <Flash ok={sp.ok} error={sp.error} />
      <form className="flex flex-wrap gap-2 items-center">
        <input className="input !w-64" name="q" defaultValue={sp.q} placeholder="Désignation ou code" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="low" value="1" defaultChecked={lowOnly} /> Seulement les stocks bas ou épuisés
        </label>
        <button className="btn btn-ghost">Filtrer</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Code</th><th className="p-3">Article</th><th className="p-3 text-right">En stock</th>
              <th className="p-3 text-right">Seuil</th><th className="p-3">État</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ product: p, onHand, low, outOfStock }) => (
              <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 font-mono">{p.code}</td>
                <td className="p-3"><Link className="underline" href={`/stock/${p.id}`}>{p.name}</Link></td>
                <td className="p-3 text-right whitespace-nowrap">{formatAmount(onHand)} {p.unit}</td>
                <td className="p-3 text-right">{Number(p.minStock) > 0 ? formatAmount(p.minStock) : "—"}</td>
                <td className="p-3" style={outOfStock || low ? { color: "var(--danger)" } : undefined}>
                  {outOfStock ? "Épuisé" : low ? "Stock bas" : "OK"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-3" colSpan={5} style={{ color: "var(--muted)" }}>
                Aucun article suivi en stock. Activez « Suivre le stock » sur une fiche article (biens uniquement).
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
