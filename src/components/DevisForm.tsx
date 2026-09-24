"use client";

import { LigneEditor, type ProduitOption } from "@/components/LigneEditor";
import { FormSection } from "@/components/layout/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { useLocale } from "@/i18n/client";

export type ClientOption = { id: string; nom: string };

export function DevisForm({
  action,
  clients,
  produits,
  defaultClientId,
}: {
  action: (formData: FormData) => void;
  clients: ClientOption[];
  produits: ProduitOption[];
  defaultClientId?: string;
}) {
  const { t } = useLocale();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <FormSection maxWidth="max-w-full" title={t("quotes.newQuote")}>
      <form action={action} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
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
          <Field label={t("quotes.validUntil")}>
            <input type="date" name="dateValidite" className="input-lg" />
          </Field>
        </div>

        <LigneEditor produits={produits} />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={t("quotes.fieldConditions")}>
            <textarea name="conditions" rows={2} className="input-lg" />
          </Field>
          <Field label={t("documents.internalNotes")}>
            <textarea name="notes" rows={2} className="input-lg" />
          </Field>
        </div>

        <FormActions cancelHref="/devis" submitLabel={t("quotes.submit")} />
      </form>
    </FormSection>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
