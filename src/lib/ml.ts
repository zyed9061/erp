import type { Translator } from "@/i18n/translate";
import type { Locale } from "@/i18n/config";
import { formatMontant } from "@/lib/format";

// Scores are produced offline by `npm run ml:train` (see ml/README.md) and stored in
// ml_invoice_scores / ml_client_segments. The app only reads and displays them.

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export const SEGMENTS = ["KEY_ACCOUNT", "RELIABLE", "OCCASIONAL_LATE", "SLOW_PAYER", "INACTIVE", "NEW"] as const;
export type Segment = (typeof SEGMENTS)[number];

export interface MlReason {
  code: string;
  values?: Record<string, string | number>;
}

/** Reason lists are stored as JSON; ignore anything that does not have the expected shape. */
export function parseReasons(value: unknown): MlReason[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is MlReason => !!r && typeof r === "object" && typeof (r as MlReason).code === "string",
  );
}

/**
 * Renders one reason in the current language (messages ml.reasons.* or ml.anomalies.*).
 * Amounts are formatted for the locale. Unknown codes (e.g. from a newer model) are skipped.
 */
export function reasonText(
  t: Translator,
  locale: Locale,
  kind: "reasons" | "anomalies",
  reason: MlReason,
): string | null {
  const key = `ml.${kind}.${reason.code}`;
  const values: Record<string, string | number> = { ...(reason.values ?? {}) };
  if (typeof values.amount === "number") values.amount = formatMontant(values.amount, "TND", locale);
  const text = t(key, values);
  return text === key ? null : text;
}

/** A stored score is only meaningful while the invoice still has something left to pay. */
export function showsRisk(statut: string, resteAPayer: number): boolean {
  return resteAPayer > 0 && statut !== "PAYEE" && statut !== "ANNULEE" && statut !== "BROUILLON";
}
