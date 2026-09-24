"use client";

import { useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, BellRing } from "lucide-react";
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
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">{t("ml.priorityTitle")}</h2>
          <p className="mt-1 text-2xl font-semibold text-red-700">{formatMontant(amountAtRisk, "TND", locale)}</p>
          <p className="text-xs text-neutral-500">
            {t("ml.atRisk")} · {t("ml.atRiskCount", { count: highRiskCount })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {reminderTargets.length > 0 && (
            <button
              type="button"
              onClick={sendReminders}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              <BellRing className="h-4 w-4" aria-hidden="true" />
              {t("ml.sendReminders", { count: reminderTargets.length })}
            </button>
          )}
          {unusualCount > 0 && (
            <Link href="/factures" className="flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {t("ml.unusualInvoices")}: {unusualCount}
            </Link>
          )}
        </div>
      </div>

      {top.length === 0 ? (
        <p className="text-sm text-neutral-500">{t("ml.noHighRisk")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-start text-xs text-neutral-500">
              <tr>
                <th className="py-1.5 pe-3 text-start font-medium">{t("documents.columnNumber")}</th>
                <th className="py-1.5 pe-3 text-start font-medium">{t("documents.columnClient")}</th>
                <th className="py-1.5 pe-3 text-start font-medium">{t("dashboard.columnDueDate")}</th>
                <th className="py-1.5 pe-3 text-end font-medium">{t("ml.columnBalance")}</th>
                <th className="py-1.5 text-end font-medium">{t("ml.columnProbability")}</th>
              </tr>
            </thead>
            <tbody>
              {top.map((row) => (
                <tr key={row.id} className="border-t border-neutral-100">
                  <td className="py-2 pe-3">
                    <Link href={`/factures/${row.id}`} className="font-medium text-brand-800 hover:underline">
                      {row.numero}
                    </Link>
                  </td>
                  <td className="py-2 pe-3 text-neutral-700">{row.clientNom}</td>
                  <td className="py-2 pe-3 text-neutral-600">{row.dateEcheance ? formatDate(row.dateEcheance, locale) : "-"}</td>
                  <td className="py-2 pe-3 text-end whitespace-nowrap">{formatMontant(row.resteAPayer, "TND", locale)}</td>
                  <td className="py-2 text-end">
                    <RiskBadge level="HIGH" probability={row.lateProbability} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
