import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { getPayment, openInvoicesForCustomer } from "@/lib/invoicing/payments";
import { formatTnd, toMilli } from "@/lib/money";
import { Flash } from "@/components/ui";
import { allocatePaymentAction, voidPaymentAction } from "../actions";
import { METHOD_LABELS } from "../labels";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "long", timeZone: "UTC" });

export default async function PaymentPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission("payments:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const details = await getPayment(db, id);
  if (!details) notFound();
  const { payment: p, customer, allocations, allocated, unallocated } = details;
  const { ok, error } = await searchParams;
  const canWrite = can(user.role, "payments:write");
  const open = !p.voidedAt && canWrite && toMilli(unallocated) > 0n ? await openInvoicesForCustomer(db, p.customerId) : [];

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Paiement du {dateFmt.format(new Date(`${p.paymentDate}T00:00:00Z`))}</h1>
        {p.voidedAt && <span className="text-xs rounded-full px-2 py-0.5 border" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>Annulé</span>}
      </div>
      <Flash ok={ok} error={error} />

      <div className="card p-4 grid gap-2 sm:grid-cols-2 text-sm">
        <p>Client : <strong>{customer?.name}</strong></p>
        <p>Montant : <strong>{formatTnd(p.amount)}</strong></p>
        <p>Mode : {METHOD_LABELS[p.method]}</p>
        <p>Référence : {p.reference ?? "—"}</p>
        <p>Imputé : {formatTnd(allocated)}</p>
        <p>Non imputé (avance) : <strong>{p.voidedAt ? "—" : formatTnd(unallocated)}</strong></p>
        {p.notes && <p className="sm:col-span-2">Notes : {p.notes}</p>}
        {p.voidedAt && <p className="sm:col-span-2" style={{ color: "var(--danger)" }}>Annulé : {p.voidReason}</p>}
      </div>

      <section className="card p-4 space-y-2">
        <h2 className="font-medium">Imputations</h2>
        {allocations.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>Aucune imputation.</p>}
        <ul className="text-sm space-y-1">
          {allocations.map((a) => (
            <li key={a.invoiceId}>
              <Link className="underline font-mono" href={`/factures/${a.invoiceId}`}>{a.number}</Link> · {formatTnd(a.allocation.amount)}
            </li>
          ))}
        </ul>
      </section>

      {open.length > 0 && (
        <form action={allocatePaymentAction} className="card p-4 space-y-3">
          <input type="hidden" name="id" value={p.id} />
          <h2 className="font-medium">Imputer le solde ({formatTnd(unallocated)})</h2>
          <table className="w-full text-sm">
            <tbody>
              {open.map((i) => (
                <tr key={i.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-2 font-mono">{i.number}</td>
                  <td className="p-2 text-right whitespace-nowrap">reste dû {formatTnd(i.due)}</td>
                  <td className="p-2 w-40"><input className="input" name={`alloc_${i.id}`} inputMode="decimal" placeholder="0,000" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-ghost">Imputer</button>
        </form>
      )}

      {!p.voidedAt && canWrite && (
        <form action={voidPaymentAction} className="card p-4 flex gap-2 flex-wrap items-end">
          <input type="hidden" name="id" value={p.id} />
          <label className="block space-y-1 flex-1 min-w-64">
            <span className="text-sm">Annuler ce paiement (irréversible) — motif *</span>
            <input className="input" name="reason" required minLength={3} maxLength={300} placeholder="Chèque impayé, erreur de saisie…" />
          </label>
          <button className="btn btn-ghost" style={{ color: "var(--danger)" }}>Annuler le paiement</button>
        </form>
      )}
    </div>
  );
}
