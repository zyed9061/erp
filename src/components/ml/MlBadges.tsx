"use client";

import { AlertTriangle } from "lucide-react";
import { useLocale } from "@/i18n/client";
import type { RiskLevel, Segment } from "@/lib/ml";

const RISK_STYLES: Record<RiskLevel, string> = {
  LOW: "bg-green-50 text-green-700",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-red-50 text-red-700",
};

const SEGMENT_STYLES: Record<Segment, string> = {
  KEY_ACCOUNT: "bg-purple-50 text-purple-700",
  RELIABLE: "bg-green-50 text-green-700",
  OCCASIONAL_LATE: "bg-amber-50 text-amber-700",
  SLOW_PAYER: "bg-red-50 text-red-700",
  INACTIVE: "bg-neutral-100 text-neutral-600",
  NEW: "bg-blue-50 text-blue-700",
};

const pill = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";

export function RiskBadge({ level, probability }: { level: RiskLevel; probability?: number | null }) {
  const { t } = useLocale();
  return (
    <span className={`${pill} ${RISK_STYLES[level]}`} title={t("ml.riskHint")}>
      {t(`ml.risk.${level}`)}
      {probability != null && <span className="opacity-75">· {Math.round(probability * 100)}%</span>}
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
    <span className={`${pill} bg-orange-50 text-orange-700`}>
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      {t("ml.anomalyBadge")}
    </span>
  );
}
