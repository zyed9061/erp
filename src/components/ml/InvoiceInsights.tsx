import { AlertTriangle, TrendingUp } from "lucide-react";
import type { MlInvoiceScore, MlModelRun } from "@/generated/prisma/client";
import type { Translator } from "@/i18n/translate";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/lib/format";
import { parseReasons, reasonText, showsRisk, type RiskLevel } from "@/lib/ml";
import { RiskBadge } from "@/components/ml/MlBadges";

/**
 * Payment forecast and anomaly warning for one invoice, from the stored ML scores.
 * Renders nothing when there is no score (e.g. the model has not been trained on this database).
 */
export function InvoiceInsights({
  score,
  run,
  statut,
  resteAPayer,
  t,
  locale,
}: {
  score: MlInvoiceScore | null;
  run: Pick<MlModelRun, "modelVersion" | "trainedAt" | "demoData"> | null;
  statut: string;
  resteAPayer: number;
  t: Translator;
  locale: Locale;
}) {
  if (!score) return null;
  const showRisk = score.riskLevel !== null && showsRisk(statut, resteAPayer);
  const showAnomaly = score.isAnomaly && statut !== "ANNULEE";
  if (!showRisk && !showAnomaly) return null;

  const riskReasons = parseReasons(score.reasons)
    .map((r) => reasonText(t, locale, "reasons", r))
    .filter((r): r is string => r !== null);
  const anomalyReasons = parseReasons(score.anomalyReasons)
    .map((r) => reasonText(t, locale, "anomalies", r))
    .filter((r): r is string => r !== null);
  const probability = score.lateProbability === null ? null : Number(score.lateProbability);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {showRisk && (
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-neutral-900">
              <TrendingUp className="h-4 w-4 text-neutral-500" aria-hidden="true" />
              {t("ml.predictionTitle")}
            </h2>
            <RiskBadge level={score.riskLevel as RiskLevel} />
          </div>
          <div className="space-y-1 text-sm text-neutral-700">
            {probability !== null && <p>{t("ml.probability", { pct: Math.round(probability * 100) })}</p>}
            {score.expectedPaymentDate && (
              <p>{t("ml.expectedPayment", { date: formatDate(score.expectedPaymentDate, locale) })}</p>
            )}
          </div>
          <h3 className="mt-4 mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">{t("ml.mainFactors")}</h3>
          {riskReasons.length > 0 && score.riskLevel !== "LOW" ? (
            <ul className="list-disc space-y-1 ps-5 text-sm text-neutral-700">
              {riskReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">{t("ml.noFactors")}</p>
          )}
          {run && (
            <p className="mt-4 text-xs text-neutral-400">
              {t("ml.modelInfo", { version: run.modelVersion, date: formatDate(run.trainedAt, locale) })}
              {run.demoData && ` · ${t("ml.demoData")}`}
            </p>
          )}
        </section>
      )}

      {showAnomaly && (
        <section className="rounded-lg border border-orange-200 bg-orange-50 p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-orange-800">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {t("ml.anomalyTitle")}
          </h2>
          <ul className="list-disc space-y-1 ps-5 text-sm text-orange-900">
            {anomalyReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
