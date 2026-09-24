"use client";

import type { Client } from "@/generated/prisma/client";
import { FormSection } from "@/components/layout/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { useLocale } from "@/i18n/client";

export function ClientForm({
  action,
  client,
}: {
  action: (formData: FormData) => void;
  client?: Client;
}) {
  const { t } = useLocale();
  const title = client ? client.nom : t("clients.newClient");

  return (
    <FormSection maxWidth="max-w-full" title={title}>
      <form action={action} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("clients.fieldType")}>
            <select name="type" defaultValue={client?.type ?? "ENTREPRISE"} className="input-lg">
              <option value="ENTREPRISE">{t("clients.typeCompany")}</option>
              <option value="PARTICULIER">{t("clients.typeIndividual")}</option>
            </select>
          </Field>
          <Field label={t("clients.fieldName")} className="lg:col-span-2">
            <input name="nom" defaultValue={client?.nom} required className="input-lg" />
          </Field>
          <Field label={t("clients.fieldTaxId")}>
            <input name="matriculeFiscal" defaultValue={client?.matriculeFiscal ?? ""} className="input-lg" />
          </Field>
          <Field label={t("clients.fieldEmail")}>
            <input type="email" name="email" defaultValue={client?.email ?? ""} className="input-lg" />
          </Field>
          <Field label={t("clients.fieldPhone")}>
            <input name="telephone" defaultValue={client?.telephone ?? ""} className="input-lg" />
          </Field>
          <Field label={t("clients.fieldCity")}>
            <input name="ville" defaultValue={client?.ville ?? ""} className="input-lg" />
          </Field>
          <Field label={t("clients.fieldPostalCode")}>
            <input name="codePostal" defaultValue={client?.codePostal ?? ""} className="input-lg" />
          </Field>
          <Field label={t("clients.fieldCountry")}>
            <input name="pays" defaultValue={client?.pays ?? "Tunisie"} className="input-lg" />
          </Field>
          <Field label={t("clients.fieldAddress")} className="sm:col-span-2 lg:col-span-3">
            <input name="adresse" defaultValue={client?.adresse ?? ""} className="input-lg" />
          </Field>
          <Field label={t("clients.fieldNotes")} className="sm:col-span-2 lg:col-span-3">
            <textarea name="notes" defaultValue={client?.notes ?? ""} rows={2} className="input-lg" />
          </Field>
        </div>

        <FormActions cancelHref="/clients" />
      </form>
    </FormSection>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
