"use client";

import { LigneEditor, type ProduitOption } from "@/components/LigneEditor";

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
  return (
    <form action={action} className="space-y-6">
      <div className="max-w-2xl">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Facture d&apos;origine</span>
          <select name="factureOrigineId" required defaultValue={factureIdParDefaut ?? ""} className="input">
            <option value="">Selectionner une facture</option>
            {factures.map((f) => (
              <option key={f.id} value={f.id}>
                {f.numero} — {f.clientNom}
              </option>
            ))}
          </select>
        </label>
      </div>

      <LigneEditor produits={produits} />

      <div className="max-w-2xl">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Motif</span>
          <textarea name="motif" rows={2} className="input" />
        </label>
      </div>

      <button
        type="submit"
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
      >
        Creer l&apos;avoir
      </button>
    </form>
  );
}
