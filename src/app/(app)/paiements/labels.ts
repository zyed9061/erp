import type { PaymentMethod } from "@/db/schema";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  especes: "Espèces", cheque: "Chèque", virement: "Virement", carte: "Carte bancaire", effet: "Effet de commerce",
};
