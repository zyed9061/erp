import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { PAYMENT_METHODS, customers } from "@/db/schema";
import { requirePermission } from "@/lib/auth/session";
import { todayTunis } from "@/lib/dates";
import { openInvoicesForCustomer } from "@/lib/invoicing/payments";
import { formatTnd } from "@/lib/money";
import { Field, Flash, PageHeader } from "@/components/ui";
import { recordPaymentAction } from "../actions";
import { METHOD_LABELS } from "../labels";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeZone: "UTC" });

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; error?: string }>;
}) {
  await requirePermission("payments:write");
  const { client, error } = await searchParams;
  const allCustomers = await db.select().from(customers).where(eq(customers.isActive, true)).orderBy(asc(customers.name));
  const customer = allCustomers.find((c) => c.id === client);
  const open = customer ? await openInvoicesForCustomer(db, customer.id) : [];

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title="Nouveau paiement" />
      <Flash error={error} />

      {/* Étape 1 : le client (formulaire GET : la page se recharge avec ses factures ouvertes) */}
      <form className="card p-4 flex flex-wrap gap-3 items-end">
        <Field label="Client" className="flex-1 min-w-64">
          <select className="input" name="client" defaultValue={customer?.id ?? ""} required>
            <option value="">— Choisir —</option>
            {allCustomers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </Field>
        <button className="btn btn-ghost">Afficher ses factures ouvertes</button>
      </form>

      {customer && (
        <form action={recordPaymentAction} className="card p-4 space-y-4">
          <input type="hidden" name="customerId" value={customer.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date du paiement *"><input className="input" type="date" name="paymentDate" defaultValue={todayTunis()} required /></Field>
            <Field label="Montant encaissé (DT) *" hint="3 décimales maximum"><input className="input" name="amount" inputMode="decimal" required /></Field>
            <Field label="Mode de paiement">
              <select className="input" name="method" defaultValue="virement">
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
              </select>
            </Field>
            <Field label="Référence (n° de chèque, de virement…)"><input className="input" name="reference" maxLength={100} /></Field>
            <Field label="Notes" className="sm:col-span-2"><input className="input" name="notes" maxLength={500} /></Field>
          </div>

          <div>
            <h2 className="font-medium mb-2">Imputer sur les factures ouvertes de {customer.name}</h2>
            {open.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>Aucune facture ouverte : le paiement sera enregistré comme avance, imputable plus tard.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ color: "var(--muted)" }}>
                      <th className="p-2">Facture</th><th className="p-2">Échéance</th><th className="p-2 text-right">Reste dû</th><th className="p-2 w-40">Montant imputé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.map((i) => (
                      <tr key={i.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="p-2 font-mono">{i.number}</td>
                        <td className="p-2">{i.dueDate ? dateFmt.format(new Date(`${i.dueDate}T00:00:00Z`)) : "—"}</td>
                        <td className="p-2 text-right whitespace-nowrap">{formatTnd(i.due)}</td>
                        <td className="p-2"><input className="input" name={`alloc_${i.id}`} inputMode="decimal" placeholder="0,000" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              Le net à payer d&apos;une facture déduit déjà la retenue à la source : saisissez uniquement l&apos;argent réellement reçu.
            </p>
          </div>
          <button className="btn">Enregistrer le paiement</button>
        </form>
      )}
    </div>
  );
}
