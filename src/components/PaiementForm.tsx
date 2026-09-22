"use client";

import { useActionState } from "react";
import { enregistrerPaiement } from "@/lib/actions/factures";

export function PaiementForm({
  factureId,
  resteAPayer,
}: {
  factureId: string;
  resteAPayer: number;
}) {
  const [state, formAction, isPending] = useActionState(enregistrerPaiement, undefined);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-medium text-neutral-900">Enregistrer un paiement</h2>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="factureId" value={factureId} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-700">Date</span>
            <input
              type="date"
              name="datePaiement"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-700">Montant</span>
            <input
              type="number"
              step="0.001"
              name="montant"
              defaultValue={resteAPayer}
              max={resteAPayer}
              required
              className="input"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-700">Mode de paiement</span>
          <select name="modePaiement" className="input">
            <option value="VIREMENT">Virement</option>
            <option value="CHEQUE">Cheque</option>
            <option value="ESPECES">Especes</option>
            <option value="CARTE">Carte</option>
            <option value="AUTRE">Autre</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-700">Reference</span>
          <input name="reference" className="input" />
        </label>

        {state?.error && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}
        {state?.success && (
          <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">
            Paiement enregistre.
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {isPending ? "Enregistrement..." : "Enregistrer le paiement"}
        </button>
      </form>
    </div>
  );
}
