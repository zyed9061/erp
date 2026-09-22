import type { Produit } from "@/generated/prisma/client";
import { FormSection } from "@/components/layout/FormSection";
import { FormActions } from "@/components/ui/FormActions";

export function ProduitForm({
  action,
  produit,
}: {
  action: (formData: FormData) => void;
  produit?: Produit;
}) {
  const title = produit ? produit.designation : "Nouveau produit / service";

  return (
    <FormSection maxWidth="max-w-full" title={title}>
      <form action={action} className="space-y-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Field label="Reference">
            <input name="reference" defaultValue={produit?.reference ?? ""} className="input-lg" />
          </Field>
          <Field label="Type">
            <select name="type" defaultValue={produit?.type ?? "SERVICE"} className="input-lg">
              <option value="SERVICE">Service</option>
              <option value="PRODUIT">Produit</option>
            </select>
          </Field>
          <Field label="Categorie">
            <input name="categorie" defaultValue={produit?.categorie ?? ""} className="input-lg" />
          </Field>
          <Field label="Designation" className="sm:col-span-2">
            <input name="designation" defaultValue={produit?.designation} required className="input-lg" />
          </Field>
          <Field label="Stock (produits uniquement)">
            <input
              type="number"
              min={0}
              step="1"
              name="stock"
              defaultValue={produit?.stock ?? ""}
              className="input-lg"
            />
          </Field>
          <Field label="Description" className="sm:col-span-3">
            <textarea
              name="description"
              defaultValue={produit?.description ?? ""}
              rows={2}
              className="input-lg"
            />
          </Field>
          <Field label="Prix unitaire HT">
            <input
              type="number"
              step="0.001"
              name="prixUnitaireHT"
              defaultValue={produit ? Number(produit.prixUnitaireHT) : undefined}
              required
              className="input-lg"
            />
          </Field>
          <Field label="Unite">
            <input name="uniteMesure" defaultValue={produit?.uniteMesure ?? "unite"} className="input-lg" />
          </Field>
          <Field label="Taux TVA (%)">
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

        <FormActions cancelHref="/produits" submitLabel="Enregistrer" />
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
