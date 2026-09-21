import type { DeliveryStatus } from "@/db/schema";

export const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  draft: "Brouillon", validated: "Validé", cancelled: "Annulé",
};
