import type { Produit } from "@/generated/prisma/client";
import { FormSection } from "@/components/layout/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import { getT } from "@/i18n/server";

export async function ProduitForm({
  action,
  produit,
}: {
  action: (formData: FormData) => void;
  produit?: Produit;
}) {
  const t = await getT();
  const title = produit ? produit.designation : t("products.formNewTitle");

  return (
    <FormSection maxWidth="max-w-full" title={title}>
      <form action={action} className="space-y-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Field label={t("products.fieldReference")}>
            <input name="reference" defaultValue={produit?.reference ?? ""} className="input-lg" />
          </Field>
          <Field label={t("products.fieldType")}>
            <select name="type" defaultValue={produit?.type ?? "SERVICE"} className="input-lg">
              <option value="SERVICE">{t("products.typeService")}</option>
              <option value="PRODUIT">{t("products.typeProduct")}</option>
            </select>
          </Field>
          <Field label={t("products.fieldCategory")}>
            <input name="categorie" defaultValue={produit?.categorie ?? ""} className="input-lg" />
          </Field>
          <Field label={t("products.fieldDesignation")} className="sm:col-span-2">
            <input name="designation" defaultValue={produit?.designation} required className="input-lg" />
          </Field>
          <Field label={t("products.fieldStock")}>
            <input
              type="number"
              min={0}
              step="1"
              name="stock"
              defaultValue={produit?.stock ?? ""}
              className="input-lg"
            />
          </Field>
          <Field label={t("products.fieldDescription")} className="sm:col-span-3">
            <textarea
              name="description"
              defaultValue={produit?.description ?? ""}
              rows={2}
              className="input-lg"
            />
          </Field>
          <Field label={t("products.fieldUnitPrice")}>
            <input
              type="number"
              step="0.001"
              name="prixUnitaireHT"
              defaultValue={produit ? Number(produit.prixUnitaireHT) : undefined}
              required
              className="input-lg"
            />
          </Field>
          <Field label={t("products.fieldUnit")}>
            <input name="uniteMesure" defaultValue={produit?.uniteMesure ?? "unite"} className="input-lg" />
          </Field>
          <Field label={t("products.fieldTaxRate")}>
            <input
              type="number"
              step="0.01"
              name="tauxTva"
              defaultValue={produit ? Number(produit.tauxTva) : 19}
              required
              className="input-lg"
            />
          </Field>
        </div>

        <FormActions cancelHref="/produits" />
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
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
