"use client";

import { useActionState } from "react";
import { enregistrerPaiement } from "@/lib/actions/factures";
import { useLocale } from "@/i18n/client";

const MODES_PAIEMENT = ["VIREMENT", "CHEQUE", "ESPECES", "CARTE", "AUTRE"] as const;

export function PaiementForm({
  factureId,
  resteAPayer,
}: {
  factureId: string;
  resteAPayer: number;
}) {
  const { t } = useLocale();
  const [state, formAction, isPending] = useActionState(enregistrerPaiement, undefined);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-medium text-neutral-900">{t("invoices.recordPaymentTitle")}</h2>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="factureId" value={factureId} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-700">{t("invoices.paymentDate")}</span>
            <input
              type="date"
              name="datePaiement"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-700">{t("invoices.paymentAmount")}</span>
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
          <span className="mb-1 block text-sm text-neutral-700">{t("invoices.paymentMethod")}</span>
          <select name="modePaiement" className="input">
            {MODES_PAIEMENT.map((mode) => (
              <option key={mode} value={mode}>
                {t(`paymentMethods.${mode}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-700">{t("invoices.paymentReference")}</span>
          <input name="reference" className="input" />
        </label>

        {state?.error && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {isPending ? t("invoices.submittingPayment") : t("invoices.submitPayment")}
        </button>
      </form>
    </div>
  );
}
