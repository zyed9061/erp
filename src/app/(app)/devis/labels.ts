import type { QuoteStatus } from "@/db/schema";

export const QUOTE_LABELS: Record<QuoteStatus, string> = {
  draft: "Brouillon", sent: "Envoyé", accepted: "Accepté", declined: "Refusé",
};
