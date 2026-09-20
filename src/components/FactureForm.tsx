"use client";

import { useState } from "react";
import { LigneEditor, type ProduitOption } from "@/components/LigneEditor";
import type { ClientOption } from "@/components/DevisForm";

export function FactureForm({
  action,
  clients,
  produits,
  tauxTimbreFiscal,
}: {
  action: (formData: FormData) => void;
  clients: ClientOption[];
  produits: ProduitOption[];
  tauxTimbreFiscal: number;
}) {
  const [appliquerTimbre, setAppliquerTimbre] = useState(true);
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
        <Field label="Date d'echeance">
          <input type="date" name="dateEcheance" className="input" />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2">
          <input
            type="checkbox"
            name="appliquerTimbreFiscal"
            checked={appliquerTimbre}
            onChange={(e) => setAppliquerTimbre(e.target.checked)}
          />
          <span className="text-sm text-neutral-700">Appliquer le timbre fiscal</span>
        </label>
      </div>

      <LigneEditor produits={produits} timbreFiscal={appliquerTimbre ? tauxTimbreFiscal : 0} />

      <div className="max-w-2xl space-y-4">
        <Field label="Conditions de paiement">
          <textarea name="conditionsPaiement" rows={2} className="input" />
        </Field>
        <Field label="Notes internes">
          <textarea name="notes" rows={2} className="input" />
        </Field>
      </div>

      <button
        type="submit"
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Creer la facture
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
