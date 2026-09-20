import type { Produit } from "@/generated/prisma/client";

export function ProduitForm({
  action,
  produit,
}: {
  action: (formData: FormData) => void;
  produit?: Produit;
}) {
  return (
    <form action={action} className="max-w-xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Reference">
          <input name="reference" defaultValue={produit?.reference ?? ""} className="input" />
        </Field>
        <Field label="Type">
          <select name="type" defaultValue={produit?.type ?? "SERVICE"} className="input">
            <option value="SERVICE">Service</option>
            <option value="PRODUIT">Produit</option>
          </select>
        </Field>
      </div>

      <Field label="Designation">
        <input name="designation" defaultValue={produit?.designation} required className="input" />
      </Field>

      <Field label="Description">
        <textarea name="description" defaultValue={produit?.description ?? ""} rows={2} className="input" />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Prix unitaire HT">
          <input
            type="number"
            step="0.001"
            name="prixUnitaireHT"
            defaultValue={produit ? Number(produit.prixUnitaireHT) : undefined}
            required
            className="input"
          />
        </Field>
        <Field label="Unite">
          <input name="uniteMesure" defaultValue={produit?.uniteMesure ?? "unite"} className="input" />
        </Field>
        <Field label="Taux TVA (%)">
          <input
            type="number"
            step="0.01"
            name="tauxTva"
            defaultValue={produit ? Number(produit.tauxTva) : 19}
            required
            className="input"
          />
        </Field>
      </div>

      <button
        type="submit"
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Enregistrer
      </button>
    </form>
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
