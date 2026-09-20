import Link from "next/link";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listPayments } from "@/lib/invoicing/payments";
import { formatTnd, fromMilli, toMilli } from "@/lib/money";
import { Flash, PageHeader, Pagination } from "@/components/ui";
import { METHOD_LABELS } from "./labels";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeZone: "UTC" });

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; voided?: string; page?: string; ok?: string; error?: string }>;
}) {
  const user = await requirePermission("payments:read");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const includeVoided = sp.voided === "1";
  const { rows, total, pageSize } = await listPayments(db, { q: sp.q, includeVoided, page });
  const qs = (p: number) =>
    `/paiements?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(includeVoided ? { voided: "1" } : {}), page: String(p) })}`;

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Paiements"
        action={can(user.role, "payments:write") ? { href: "/paiements/nouveau", label: "Nouveau paiement" } : undefined}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form className="flex flex-wrap gap-2 items-center">
        <input className="input !w-64" name="q" defaultValue={sp.q} placeholder="Client ou référence" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="voided" value="1" defaultChecked={includeVoided} /> Inclure les annulés
        </label>
        <button className="btn btn-ghost">Filtrer</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Date</th><th className="p-3">Client</th><th className="p-3">Mode</th>
              <th className="p-3">Référence</th><th className="p-3 text-right">Montant</th>
              <th className="p-3 text-right">Non imputé</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ payment: p, customerName, allocated }) => {
              const unallocated = fromMilli(toMilli(p.amount) - toMilli(allocated));
              return (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)", opacity: p.voidedAt ? 0.55 : 1 }}>
                  <td className="p-3 whitespace-nowrap"><Link className="underline" href={`/paiements/${p.id}`}>{dateFmt.format(new Date(`${p.paymentDate}T00:00:00Z`))}</Link></td>
                  <td className="p-3">{customerName}</td>
                  <td className="p-3">{METHOD_LABELS[p.method]}</td>
                  <td className="p-3">{p.reference ?? "—"}</td>
                  <td className="p-3 text-right whitespace-nowrap">{formatTnd(p.amount)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{p.voidedAt ? "—" : formatTnd(unallocated)}</td>
                  <td className="p-3 text-xs" style={{ color: "var(--danger)" }}>{p.voidedAt ? "Annulé" : ""}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td className="p-3" colSpan={7} style={{ color: "var(--muted)" }}>Aucun paiement.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} href={qs} />
    </div>
  );
}
