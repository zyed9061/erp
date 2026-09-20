import { CUSTOMER_TAX_STATUSES, CUSTOMER_TYPES, type Customer, type PaymentTerm, type TaxRate } from "@/db/schema";
import { Field } from "@/components/ui";
import { formatPercent } from "@/lib/money";

const TYPE_LABELS = { entreprise: "Entreprise", particulier: "Particulier", etranger: "Client étranger" } as const;
const STATUS_LABELS = {
  assujetti: "Assujetti à la TVA",
  exonere: "Exonéré",
  export: "Export / suspension de TVA",
  non_assujetti: "Non assujetti",
} as const;

export function CustomerForm({
  action, customer, terms, withholdingRates, canWrite, submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  customer?: Customer;
  terms: PaymentTerm[];
  withholdingRates: TaxRate[];
  canWrite: boolean;
  submitLabel: string;
}) {
  return (
    <form action={action} className="card p-4">
      <fieldset disabled={!canWrite} className="grid gap-3 sm:grid-cols-2">
        {customer && <input type="hidden" name="id" value={customer.id} />}
        <Field label="Nom / raison sociale *"><input className="input" name="name" defaultValue={customer?.name} required maxLength={200} /></Field>
        {!customer && (
          <Field label="Code client" hint="Laissez vide pour une attribution automatique (CLI-00001…)">
            <input className="input" name="code" maxLength={30} />
          </Field>
        )}
        <Field label="Type">
          <select className="input" name="type" defaultValue={customer?.type ?? "entreprise"}>
            {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field label="Statut TVA">
          <select className="input" name="taxStatus" defaultValue={customer?.taxStatus ?? "assujetti"}>
            {CUSTOMER_TAX_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Matricule fiscal" hint="Obligatoire pour une entreprise assujettie à la TVA">
          <input className="input" name="matriculeFiscal" defaultValue={customer?.matriculeFiscal ?? ""} maxLength={30} />
        </Field>
        <Field label="Condition de paiement">
          <select className="input" name="paymentTermId" defaultValue={customer?.paymentTermId ?? ""}>
            <option value="">Par défaut</option>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Adresse" className="sm:col-span-2"><input className="input" name="address" defaultValue={customer?.address ?? ""} maxLength={300} /></Field>
        <Field label="Ville"><input className="input" name="city" defaultValue={customer?.city ?? ""} maxLength={100} /></Field>
        <Field label="Code postal"><input className="input" name="postalCode" defaultValue={customer?.postalCode ?? ""} maxLength={20} /></Field>
        <Field label="Pays (code ISO)"><input className="input" name="country" defaultValue={customer?.country ?? "TN"} maxLength={2} /></Field>
        <Field label="Téléphone"><input className="input" name="phone" defaultValue={customer?.phone ?? ""} maxLength={40} /></Field>
        <Field label="E-mail" className="sm:col-span-2"><input className="input" name="email" type="email" defaultValue={customer?.email ?? ""} /></Field>

        <div className="sm:col-span-2 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="stampExempt" defaultChecked={customer?.stampExempt} /> Exonéré de timbre fiscal
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="withholdingApplies" defaultChecked={customer?.withholdingApplies} /> Applique la retenue à la source
          </label>
        </div>
        <Field label="Taux de retenue à la source" hint={withholdingRates.length ? undefined : "Aucun taux défini : créez-en un dans Paramètres › Taxes."}>
          <select className="input" name="withholdingRateId" defaultValue={customer?.withholdingRateId ?? ""}>
            <option value="">—</option>
            {withholdingRates.map((r) => <option key={r.id} value={r.id}>{r.label} ({formatPercent(r.rate)})</option>)}
          </select>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" name="notes" rows={3} defaultValue={customer?.notes ?? ""} maxLength={2000} /></Field>
        {canWrite && <div className="sm:col-span-2"><button className="btn">{submitLabel}</button></div>}
      </fieldset>
    </form>
  );
}
