import Link from "next/link";
import { INVOICE_KINDS, INVOICE_STATUSES, type InvoiceKind, type InvoiceStatus } from "@/db/schema";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listInvoices } from "@/lib/invoicing/invoices";
import { PAYMENT_STATUS_LABELS, paymentStateOf } from "@/lib/invoicing/payments";
import { formatTnd } from "@/lib/money";
import { Flash, PageHeader, Pagination } from "@/components/ui";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeZone: "UTC" });
const KIND_LABELS = { invoice: "Facture", credit_note: "Avoir", deposit_invoice: "Facture d'acompte" } as const;
const KIND_PLURALS = { invoice: "Factures", credit_note: "Avoirs", deposit_invoice: "Factures d'acompte" } as const;
const STATUS_LABELS = { draft: "Brouillon", validated: "Validé" } as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; status?: string; payment?: string; page?: string; ok?: string; error?: string }>;
}) {
  const user = await requirePermission("invoices:read");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const kind = INVOICE_KINDS.find((k) => k === sp.kind) as InvoiceKind | undefined;
  const status = INVOICE_STATUSES.find((s) => s === sp.status) as InvoiceStatus | undefined;
  const payment = (["open", "overdue", "paid"] as const).find((p) => p === sp.payment);
  const { rows, total, pageSize } = await listInvoices(db, { q: sp.q, kind, status, payment, page });
  const qs = (p: number) =>
    `/factures?${new URLSearchParams({
      ...(sp.q ? { q: sp.q } : {}), ...(kind ? { kind } : {}), ...(status ? { status } : {}),
      ...(payment ? { payment } : {}), page: String(p),
    })}`;

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Factures et avoirs"
        action={can(user.role, "invoices:write") ? { href: "/factures/nouveau", label: "Nouvelle facture" } : undefined}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form className="flex flex-wrap gap-2 items-center">
        <input className="input !w-64" name="q" defaultValue={sp.q} placeholder="Numéro, client, référence" />
        <select className="input !w-auto" name="kind" defaultValue={kind ?? ""}>
          <option value="">Factures et avoirs</option>
          {INVOICE_KINDS.map((k) => <option key={k} value={k}>{KIND_PLURALS[k]}</option>)}
        </select>
        <select className="input !w-auto" name="status" defaultValue={status ?? ""}>
          <option value="">Tous les statuts</option>
          {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select className="input !w-auto" name="payment" defaultValue={payment ?? ""}>
          <option value="">Tous les paiements</option>
          <option value="open">À encaisser</option>
          <option value="overdue">En retard</option>
          <option value="paid">Soldées</option>
        </select>
        <button className="btn btn-ghost">Filtrer</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Numéro</th><th className="p-3">Type</th><th className="p-3">Client</th>
              <th className="p-3">Date</th><th className="p-3">Échéance</th>
              <th className="p-3 text-right">Total TTC</th><th className="p-3 text-right">Net à payer</th><th className="p-3">Statut</th><th className="p-3">Paiement</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ invoice: i, customerName, credited, paid }) => {
              const pay = i.status === "validated" && i.kind !== "credit_note"
                ? paymentStateOf({ netToPay: i.netToPay, credited: credited ?? "0", paid: paid ?? "0" }, i.dueDate)
                : null;
              return (
              <tr key={i.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 font-mono">
                  <Link className="underline" href={`/factures/${i.id}`}>{i.number ?? "Brouillon"}</Link>
                </td>
                <td className="p-3">{KIND_LABELS[i.kind]}</td>
                <td className="p-3">{customerName}</td>
                <td className="p-3 whitespace-nowrap">{dateFmt.format(new Date(`${i.issueDate}T00:00:00Z`))}</td>
                <td className="p-3 whitespace-nowrap">{i.dueDate ? dateFmt.format(new Date(`${i.dueDate}T00:00:00Z`)) : "—"}</td>
                <td className="p-3 text-right whitespace-nowrap">{formatTnd(i.totalTtc)}</td>
                <td className="p-3 text-right whitespace-nowrap">{formatTnd(i.netToPay)}</td>
                <td className="p-3">{STATUS_LABELS[i.status]}</td>
                <td className="p-3 whitespace-nowrap">
                  {pay ? PAYMENT_STATUS_LABELS[pay.status] : "—"}
                  {pay?.overdue && <span className="ml-1 text-xs" style={{ color: "var(--danger)" }}>retard</span>}
                </td>
              </tr>
              );
            })}
            {rows.length === 0 && <tr><td className="p-3" colSpan={9} style={{ color: "var(--muted)" }}>Aucun document.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} href={qs} />
    </div>
  );
}
