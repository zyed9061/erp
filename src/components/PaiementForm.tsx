"use client";

import { useActionState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CircleDollarSign, Loader2 } from "lucide-react";
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
    <div className="card relative h-full overflow-hidden p-5 sm:p-6">
      <span className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-emerald-400 via-teal-400 to-sky-400" aria-hidden="true" />
      <h2 className="section-title mb-4 flex items-center gap-2">
        <CircleDollarSign className="h-4.5 w-4.5 text-emerald-500" aria-hidden="true" />
        {t("invoices.recordPaymentTitle")}
      </h2>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="factureId" value={factureId} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t("invoices.paymentDate")}</span>
            <input
              type="date"
              name="datePaiement"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t("invoices.paymentAmount")}</span>
            <input
              type="number"
              step="0.001"
              name="montant"
              defaultValue={resteAPayer}
              max={resteAPayer}
              required
              className="input tabular-nums"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t("invoices.paymentMethod")}</span>
          <select name="modePaiement" className="input">
            {MODES_PAIEMENT.map((mode) => (
              <option key={mode} value={mode}>
                {t(`paymentMethods.${mode}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t("invoices.paymentReference")}</span>
          <input name="reference" className="input" />
        </label>

        <AnimatePresence mode="wait">
          {state?.error && (
            <motion.p
              key={state.error}
              role="alert"
              initial={{ opacity: 0, x: 0 }}
              animate={{ opacity: 1, x: [0, -8, 8, -5, 5, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {state.error}
            </motion.p>
          )}
        </AnimatePresence>

        <button type="submit" disabled={isPending} aria-busy={isPending} className="btn-primary h-10 w-full sm:w-auto">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isPending ? t("invoices.submittingPayment") : t("invoices.submitPayment")}
        </button>
      </form>
    </div>
  );
}
