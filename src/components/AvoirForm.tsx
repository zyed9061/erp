"use client";

import { LigneEditor, type ProduitOption } from "@/components/LigneEditor";
import { FormSection } from "@/components/layout/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { useLocale } from "@/i18n/client";

export type FactureOption = { id: string; numero: string; clientNom: string };

export function AvoirForm({
  action,
  factures,
  produits,
  factureIdParDefaut,
}: {
  action: (formData: FormData) => void;
  factures: FactureOption[];
  produits: ProduitOption[];
  factureIdParDefaut?: string;
}) {
  const { t } = useLocale();

  return (
    <FormSection maxWidth="max-w-full" title={t("creditNotes.newCreditNote")}>
      <form action={action} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t("creditNotes.originInvoice")}</span>
            <select
              name="factureOrigineId"
              required
              defaultValue={factureIdParDefaut ?? ""}
              className="input-lg"
            >
              <option value="">{t("creditNotes.selectInvoice")}</option>
              {factures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.numero} — {f.clientNom}
                </option>
              ))}
            </select>
          </label>
        </div>

        <LigneEditor produits={produits} />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t("creditNotes.fieldReason")}</span>
            <textarea name="motif" rows={2} className="input-lg" />
          </label>
        </div>

        <FormActions
          cancelHref={factureIdParDefaut ? `/factures/${factureIdParDefaut}` : "/avoirs"}
          submitLabel={t("creditNotes.submit")}
        />
      </form>
    </FormSection>
  );
}
