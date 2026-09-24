"use client";

import { useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, BellRing, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { useToast } from "@/components/ui/Toast";
import { RiskBadge } from "@/components/ml/MlBadges";
import { formatDate, formatMontant } from "@/lib/format";
import { sendPaymentReminder } from "@/lib/services/notifications";

export interface PriorityRow {
  id: string;
  numero: string;
  clientNom: string;
  clientEmail: string | null;
  resteAPayer: number;
  lateProbability: number;
  dateEcheance: string | null;
}

/** High-risk open invoices (from the ML scores) with a one-click reminder for all of them. */
export function PriorityCollections({
  top,
  reminderTargets,
  amountAtRisk,
  highRiskCount,
  unusualCount,
}: {
  top: PriorityRow[];
  reminderTargets: Pick<PriorityRow, "id" | "numero" | "clientEmail">[];
  amountAtRisk: number;
  highRiskCount: number;
  unusualCount: number;
}) {
  const { t, locale } = useLocale();
  const { showSuccess } = useToast();
  const [isPending, startTransition] = useTransition();

  function sendReminders() {
    startTransition(async () => {
      const results = await Promise.all(
        reminderTargets.map((r) =>
          sendPaymentReminder({ factureId: r.id, numero: r.numero, clientEmail: r.clientEmail }),
        ),
      );
      const sent = results.filter((r) => r.success).length;
      showSuccess(t("ml.remindersSent", { sent, skipped: results.length - sent }));
    });
  }

  return (
    <div className="card relative h-full overflow-hidden p-5 sm:p-6">
      <div aria-hidden="true" className="pointer-events-none absolute -end-20 -top-20 h-56 w-56 rounded-full bg-rose-500/10 blur-3xl" />
      <div className="relative mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/30">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="section-title">{t("ml.priorityTitle")}</h2>
            <p className="mt-1 bg-linear-to-r from-rose-600 to-orange-500 bg-clip-text text-2xl font-semibold tracking-tight text-transparent tabular-nums sm:text-3xl">
              {formatMontant(amountAtRisk, "TND", locale)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {t("ml.atRisk")} · {t("ml.atRiskCount", { count: highRiskCount })}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {reminderTargets.length > 0 && (
            <motion.button
              type="button"
              onClick={sendReminders}
              disabled={isPending}
              whileTap={{ scale: 0.97 }}
              className="btn-primary"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <BellRing className="h-4 w-4" aria-hidden="true" />
              )}
              {t("ml.sendReminders", { count: reminderTargets.length })}
            </motion.button>
          )}
          {unusualCount > 0 && (
            <Link
              href="/factures"
              className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 ring-1 ring-orange-200/70 transition hover:bg-orange-100"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {t("ml.unusualInvoices")}: {unusualCount}
            </Link>
          )}
        </div>
      </div>

      {top.length === 0 ? (
        <div className="relative flex flex-col items-center gap-2 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-8 text-center">
          <ShieldCheck className="h-8 w-8 text-emerald-500" aria-hidden="true" />
          <p className="text-sm text-slate-600">{t("ml.noHighRisk")}</p>
        </div>
      ) : (
        <>
          {/* Phones: stacked rows. */}
          <ul className="relative space-y-2 sm:hidden">
            {top.map((row, i) => (
              <motion.li
                key={row.id}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
              >
                <Link
                  href={`/factures/${row.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-100 transition hover:bg-brand-50/60"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-brand-700">{row.numero}</span>
                    <span className="block truncate text-xs text-slate-500">{row.clientNom}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">
                      {formatMontant(row.resteAPayer, "TND", locale)}
                    </span>
                    <RiskBadge level="HIGH" probability={row.lateProbability} />
                  </span>
                </Link>
              </motion.li>
            ))}
          </ul>

          {/* Tablets and up: table. */}
          <div className="relative -mx-5 hidden overflow-x-auto sm:-mx-6 sm:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="ps-6">{t("documents.columnNumber")}</th>
                  <th>{t("documents.columnClient")}</th>
                  <th>{t("dashboard.columnDueDate")}</th>
                  <th className="text-end!">{t("ml.columnBalance")}</th>
                  <th className="pe-6 text-end!">{t("ml.columnProbability")}</th>
                </tr>
              </thead>
              <tbody>
                {top.map((row, i) => (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <td className="ps-6">
                      <Link href={`/factures/${row.id}`} className="font-medium text-brand-700 hover:underline">
                        {row.numero}
                      </Link>
                    </td>
                    <td className="max-w-48 truncate">{row.clientNom}</td>
                    <td className="whitespace-nowrap text-slate-500">
                      {row.dateEcheance ? formatDate(row.dateEcheance, locale) : "-"}
                    </td>
                    <td className="text-end font-medium whitespace-nowrap text-slate-900 tabular-nums">
                      {formatMontant(row.resteAPayer, "TND", locale)}
                    </td>
                    <td className="pe-6 text-end">
                      <RiskBadge level="HIGH" probability={row.lateProbability} />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
