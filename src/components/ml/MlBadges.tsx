"use client";

import { AlertTriangle } from "lucide-react";
import { useLocale } from "@/i18n/client";
import type { RiskLevel, Segment } from "@/lib/ml";

const RISK_STYLES: Record<RiskLevel, string> = {
  LOW: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  MEDIUM: "bg-amber-50 text-amber-700 ring-amber-600/20",
  HIGH: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

const SEGMENT_STYLES: Record<Segment, string> = {
  KEY_ACCOUNT: "bg-linear-to-r from-violet-50 to-fuchsia-50 text-violet-700 ring-violet-600/20",
  RELIABLE: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  OCCASIONAL_LATE: "bg-amber-50 text-amber-700 ring-amber-600/20",
  SLOW_PAYER: "bg-rose-50 text-rose-700 ring-rose-600/20",
  INACTIVE: "bg-slate-100 text-slate-600 ring-slate-500/15",
  NEW: "bg-sky-50 text-sky-700 ring-sky-600/15",
};

const pill = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset";

export function RiskBadge({ level, probability }: { level: RiskLevel; probability?: number | null }) {
  const { t } = useLocale();
  return (
    <span className={`${pill} ${RISK_STYLES[level]}`} title={t("ml.riskHint")}>
      {t(`ml.risk.${level}`)}
      {probability != null && <span className="tabular-nums opacity-75">· {Math.round(probability * 100)}%</span>}
    </span>
  );
}

export function SegmentBadge({ segment }: { segment: Segment }) {
  const { t } = useLocale();
  return (
    <span className={`${pill} ${SEGMENT_STYLES[segment]}`} title={t(`ml.segmentHint.${segment}`)}>
      {t(`ml.segment.${segment}`)}
    </span>
  );
}

export function AnomalyBadge() {
  const { t } = useLocale();
  return (
    <span className={`${pill} bg-orange-50 text-orange-700 ring-orange-600/20`}>
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      {t("ml.anomalyBadge")}
    </span>
  );
}
