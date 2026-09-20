import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { getCustomer } from "@/lib/customers";
import { listPaymentTerms } from "@/lib/payment-terms";
import { listTaxRates } from "@/lib/taxes";
import { Field, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { addContactAction, removeContactAction, toggleCustomerAction, updateCustomerAction } from "../actions";
import { CustomerForm } from "../customer-form";

export const dynamic = "force-dynamic";

export default async function CustomerPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission("customers:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const found = await getCustomer(db, id);
  if (!found) notFound();
  const { customer, contacts } = found;
  const { ok, error } = await searchParams;
  const canWrite = can(user.role, "customers:write");

  const [terms, withholdingRates] = await Promise.all([
    listPaymentTerms(db, { activeOnly: true }),
    listTaxRates(db, { kind: "retenue", activeOnly: true }),
  ]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap">
        <PageHeader title={customer.name} />
        <span className="font-mono text-sm" style={{ color: "var(--muted)" }}>{customer.code}</span>
        <StatusBadge active={customer.isActive} />
      </div>
      <Flash ok={ok} error={error} />

      <CustomerForm
        action={updateCustomerAction} customer={customer} terms={terms} withholdingRates={withholdingRates}
        canWrite={canWrite} submitLabel="Enregistrer"
      />

      {canWrite && (
        <form action={toggleCustomerAction}>
          <input type="hidden" name="id" value={customer.id} />
          <input type="hidden" name="isActive" value={String(!customer.isActive)} />
          <button className="btn btn-ghost" style={customer.isActive ? { color: "var(--danger)" } : undefined}>
            {customer.isActive ? "Désactiver ce client" : "Réactiver ce client"}
          </button>
        </form>
      )}

      <section className="card p-4 space-y-3">
        <h2 className="font-medium">Contacts</h2>
        {contacts.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>Aucun contact.</p>}
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 text-sm border-t pt-2" style={{ borderColor: "var(--border)" }}>
              <span>
                <strong>{c.name}</strong>{c.role ? ` · ${c.role}` : ""}{c.isBilling ? " · facturation" : ""}
                <br /><span style={{ color: "var(--muted)" }}>{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              {canWrite && (
                <form action={removeContactAction}>
                  <input type="hidden" name="customerId" value={customer.id} />
                  <input type="hidden" name="contactId" value={c.id} />
                  <button className="btn btn-ghost">Supprimer</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {canWrite && (
          <form action={addContactAction} className="grid gap-3 sm:grid-cols-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <input type="hidden" name="customerId" value={customer.id} />
            <Field label="Nom *"><input className="input" name="name" required maxLength={120} /></Field>
            <Field label="Fonction"><input className="input" name="role" maxLength={80} /></Field>
            <Field label="E-mail"><input className="input" name="email" type="email" /></Field>
            <Field label="Téléphone"><input className="input" name="phone" maxLength={40} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="isBilling" /> Contact de facturation
            </label>
            <div className="sm:col-span-2"><button className="btn btn-ghost">Ajouter le contact</button></div>
          </form>
        )}
      </section>
    </div>
  );
}
