"use client";

import { LigneEditor, type ProduitOption } from "@/components/LigneEditor";

export type ClientOption = { id: string; nom: string };

export function DevisForm({
  action,
  clients,
  produits,
}: {
  action: (formData: FormData) => void;
  clients: ClientOption[];
  produits: ProduitOption[];
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-6">
      <div className="grid max-w-2xl grid-cols-2 gap-4">
        <Field label="Client">
          <select name="clientId" required className="input">
            <option value="">Selectionner un client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date d'emission">
          <input type="date" name="dateEmission" defaultValue={today} required className="input" />
        </Field>
        <Field label="Valable jusqu'au">
          <input type="date" name="dateValidite" className="input" />
        </Field>
      </div>

      <LigneEditor produits={produits} />

      <div className="max-w-2xl space-y-4">
        <Field label="Conditions">
          <textarea name="conditions" rows={2} className="input" />
        </Field>
        <Field label="Notes internes">
          <textarea name="notes" rows={2} className="input" />
        </Field>
      </div>

      <button
        type="submit"
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
      >
        Creer le devis
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
