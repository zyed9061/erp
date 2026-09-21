import Link from "next/link";
import { DELIVERY_STATUSES } from "@/db/schema";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listDeliveryNotes } from "@/lib/delivery";
import { Flash, PageHeader, Pagination } from "@/components/ui";
import { invoiceDeliveriesAction } from "./actions";
import { DELIVERY_LABELS } from "./labels";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeZone: "UTC" });

export default async function DeliveryNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; toInvoice?: string; page?: string; ok?: string; error?: string }>;
}) {
  const user = await requirePermission("delivery:read");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status = DELIVERY_STATUSES.find((s) => s === sp.status);
  const toInvoice = sp.toInvoice === "1";
  const { rows, total, pageSize } = await listDeliveryNotes(db, { q: sp.q, status, toInvoice, page });
  const canInvoice = can(user.role, "invoices:write");
  const qs = (p: number) =>
    `/livraisons?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(status ? { status } : {}), ...(toInvoice ? { toInvoice: "1" } : {}), page: String(p) })}`;

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Bons de livraison"
        action={can(user.role, "delivery:write") ? { href: "/livraisons/nouveau", label: "Nouveau bon" } : undefined}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form className="flex flex-wrap gap-2 items-center">
        <input className="input !w-64" name="q" defaultValue={sp.q} placeholder="Numéro, client, référence" />
        <select className="input !w-auto" name="status" defaultValue={status ?? ""}>
          <option value="">Tous les statuts</option>
          {DELIVERY_STATUSES.map((s) => <option key={s} value={s}>{DELIVERY_LABELS[s]}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="toInvoice" value="1" defaultChecked={toInvoice} /> À facturer
        </label>
        <button className="btn btn-ghost">Filtrer</button>
      </form>

      <form action={invoiceDeliveriesAction} className="space-y-3">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: "var(--muted)" }}>
                {canInvoice && <th className="p-3 w-8" />}
                <th className="p-3">Numéro</th><th className="p-3">Client</th><th className="p-3">Date</th>
                <th className="p-3">Référence</th><th className="p-3">Statut</th><th className="p-3">Facturation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ note: n, customerName }) => {
                const invoiceable = n.status === "validated" && !n.invoiceId;
                return (
                  <tr key={n.id} className="border-t" style={{ borderColor: "var(--border)", opacity: n.status === "cancelled" ? 0.55 : 1 }}>
                    {canInvoice && (
                      <td className="p-3">{invoiceable && <input type="checkbox" name="noteId" value={n.id} aria-label={`Facturer ${n.number}`} />}</td>
                    )}
                    <td className="p-3 font-mono"><Link className="underline" href={`/livraisons/${n.id}`}>{n.number ?? "Brouillon"}</Link></td>
                    <td className="p-3">{customerName}</td>
                    <td className="p-3 whitespace-nowrap">{dateFmt.format(new Date(`${n.issueDate}T00:00:00Z`))}</td>
                    <td className="p-3">{n.reference ?? "—"}</td>
                    <td className="p-3">{DELIVERY_LABELS[n.status]}</td>
                    <td className="p-3">
                      {n.invoiceId ? <Link className="underline" href={`/factures/${n.invoiceId}`}>Facturé</Link> : invoiceable ? "À facturer" : "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td className="p-3" colSpan={7} style={{ color: "var(--muted)" }}>Aucun bon de livraison.</td></tr>}
            </tbody>
          </table>
        </div>
        {canInvoice && rows.some((r) => r.note.status === "validated" && !r.note.invoiceId) && (
          <div className="flex items-center gap-3 flex-wrap">
            <button className="btn">Facturer les bons cochés</button>
            <span className="text-xs" style={{ color: "var(--muted)" }}>Les bons doivent concerner le même client. Une facture brouillon est créée, aux prix figés sur les bons.</span>
          </div>
        )}
      </form>
      <Pagination page={page} pageSize={pageSize} total={total} href={qs} />
    </div>
  );
}
