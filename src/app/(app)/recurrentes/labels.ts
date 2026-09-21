import type { RecurringStatus } from "@/db/schema";

export const RECURRING_STATUS_LABELS: Record<RecurringStatus, string> = {
  active: "Actif", paused: "En pause", ended: "Terminé",
};
