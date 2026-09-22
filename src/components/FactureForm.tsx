"use client";

import { useState } from "react";
import { LigneEditor, type ProduitOption } from "@/components/LigneEditor";
import type { ClientOption } from "@/components/DevisForm";
import { FormSection } from "@/components/layout/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { useLocale } from "@/i18n/client";

export function FactureForm({
  action,
  clients,
  produits,
  tauxTimbreFiscal,
  defaultClientId,
}: {
  action: (formData: FormData) => void;
  clients: ClientOption[];
  produits: ProduitOption[];
  tauxTimbreFiscal: number;
  defaultClientId?: string;
}) {
  const { t } = useLocale();
  const [appliquerTimbre, setAppliquerTimbre] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <FormSection maxWidth="max-w-full" title={t("invoices.newInvoice")}>
      <form action={action} className="space-y-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Field label={t("documents.client")}>
            <select name="clientId" required defaultValue={defaultClientId ?? ""} className="input-lg">
              <option value="">{t("documents.selectClient")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("documents.issueDate")}>
            <input type="date" name="dateEmission" defaultValue={today} required className="input-lg" />
          </Field>
          <Field label={t("invoices.dueDate")}>
            <input type="date" name="dateEcheance" className="input-lg" />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2">
            <input
              type="checkbox"
              name="appliquerTimbreFiscal"
              checked={appliquerTimbre}
              onChange={(e) => setAppliquerTimbre(e.target.checked)}
            />
            <span className="text-sm text-neutral-700">{t("invoices.applyStampDuty")}</span>
          </label>
        </div>

        <LigneEditor produits={produits} timbreFiscal={appliquerTimbre ? tauxTimbreFiscal : 0} />

        <div className="grid grid-cols-2 gap-5">
          <Field label={t("invoices.paymentTerms")}>
            <textarea name="conditionsPaiement" rows={2} className="input-lg" />
          </Field>
          <Field label={t("documents.internalNotes")}>
            <textarea name="notes" rows={2} className="input-lg" />
          </Field>
        </div>

        <FormActions cancelHref="/factures" submitLabel={t("invoices.submit")} />
      </form>
    </FormSection>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
