"use client";

import { LigneEditor, type ProduitOption } from "@/components/LigneEditor";
import { FormSection } from "@/components/layout/FormSection";
import { FormActions } from "@/components/ui/FormActions";

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
    <FormSection maxWidth="max-w-full" title="Nouvel avoir">
      <form action={action} className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">Facture d&apos;origine</span>
            <select
              name="factureOrigineId"
              required
              defaultValue={factureIdParDefaut ?? ""}
              className="input-lg"
            >
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

        <div className="grid grid-cols-2 gap-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">Motif</span>
            <textarea name="motif" rows={2} className="input-lg" />
          </label>
        </div>

        <FormActions
          cancelHref={factureIdParDefaut ? `/factures/${factureIdParDefaut}` : "/avoirs"}
          submitLabel="Creer l'avoir"
        />
      </form>
    </FormSection>
  );
}
