import { AlertTriangle, BrainCircuit, CalendarCheck2 } from "lucide-react";
import type { MlInvoiceScore, MlModelRun } from "@/generated/prisma/client";
import type { Translator } from "@/i18n/translate";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/lib/format";
import { parseReasons, reasonText, showsRisk, type RiskLevel } from "@/lib/ml";
import { RiskBadge } from "@/components/ml/MlBadges";
import { FadeIn } from "@/components/motion/Motion";

const RISK_BAR: Record<RiskLevel, string> = {
  LOW: "from-emerald-400 to-teal-500",
  MEDIUM: "from-amber-400 to-orange-500",
  HIGH: "from-rose-500 to-red-500",
};

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

  const level = score.riskLevel as RiskLevel;
  const pct = probability === null ? null : Math.round(probability * 100);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {showRisk && (
        <FadeIn className="card relative overflow-hidden p-5 sm:p-6">
          <div aria-hidden="true" className="pointer-events-none absolute -end-16 -top-16 h-44 w-44 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative mb-4 flex items-center justify-between gap-3">
            <h2 className="section-title flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-violet-500 to-brand-600 text-white shadow-md shadow-violet-500/30">
                <BrainCircuit className="h-4 w-4" aria-hidden="true" />
              </span>
              {t("ml.predictionTitle")}
            </h2>
            <RiskBadge level={level} />
          </div>
          {pct !== null && (
            <div className="relative">
              <p className="text-sm text-slate-700">{t("ml.probability", { pct })}</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full bg-linear-to-r ${RISK_BAR[level]}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          {score.expectedPaymentDate && (
            <p className="relative mt-3 flex items-center gap-2 text-sm text-slate-700">
              <CalendarCheck2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
              {t("ml.expectedPayment", { date: formatDate(score.expectedPaymentDate, locale) })}
            </p>
          )}
          <h3 className="relative mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t("ml.mainFactors")}</h3>
          {riskReasons.length > 0 && score.riskLevel !== "LOW" ? (
            <ul className="relative space-y-1.5 text-sm text-slate-700">
              {riskReasons.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" aria-hidden="true" />
                  {reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="relative text-sm text-slate-500">{t("ml.noFactors")}</p>
          )}
          {run && (
            <p className="relative mt-5 border-t border-slate-100 pt-3 text-xs text-slate-400">
              {t("ml.modelInfo", { version: run.modelVersion, date: formatDate(run.trainedAt, locale) })}
              {run.demoData && ` · ${t("ml.demoData")}`}
            </p>
          )}
        </FadeIn>
      )}

      {showAnomaly && (
        <FadeIn delay={0.08} className="relative overflow-hidden rounded-2xl bg-linear-to-br from-orange-50 to-amber-50 p-5 ring-1 ring-orange-200/70 sm:p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-orange-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-orange-400 to-amber-500 text-white shadow-md shadow-orange-500/30">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
            {t("ml.anomalyTitle")}
          </h2>
          <ul className="space-y-1.5 text-sm text-orange-900">
            {anomalyReasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" aria-hidden="true" />
                {reason}
              </li>
            ))}
          </ul>
        </FadeIn>
      )}
    </div>
  );
}
