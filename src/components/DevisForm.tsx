"use client";

import { LigneEditor, type ProduitOption } from "@/components/LigneEditor";
import { FormSection } from "@/components/layout/FormSection";
import { FormActions } from "@/components/ui/FormActions";

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
  const today = new Date().toISOString().slice(0, 10);

  return (
    <FormSection maxWidth="max-w-full" title="Nouveau devis">
      <form action={action} className="space-y-5">
        <div className="grid grid-cols-3 gap-5">
          <Field label="Client">
            <select name="clientId" required defaultValue={defaultClientId ?? ""} className="input-lg">
              <option value="">Selectionner un client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date d'emission">
            <input type="date" name="dateEmission" defaultValue={today} required className="input-lg" />
          </Field>
          <Field label="Valable jusqu'au">
            <input type="date" name="dateValidite" className="input-lg" />
          </Field>
        </div>

        <LigneEditor produits={produits} />

        <div className="grid grid-cols-2 gap-5">
          <Field label="Conditions">
            <textarea name="conditions" rows={2} className="input-lg" />
          </Field>
          <Field label="Notes internes">
            <textarea name="notes" rows={2} className="input-lg" />
          </Field>
        </div>

        <FormActions cancelHref="/devis" submitLabel="Creer le devis" />
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
