"use client";

import { useLocale } from "@/i18n/client";

// Conserve pour les pages de detail (devis, factures, avoirs) qui l'importaient deja.
// Une seule source de verite : la pastille partagee de `components/ui`
// (libelle traduit via le dictionnaire `status.*`).
export { StatutPill as StatutBadge } from "@/components/ui/StatutPill";

export function ActifBadge({
  actif,
  inactiveLabel,
}: {
  actif: boolean;
  inactiveLabel?: string;
}) {
  const { t } = useLocale();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        actif ? "bg-green-50 text-green-700" : "bg-neutral-200 text-neutral-600"
      }`}
    >
      {actif ? t("common.active") : (inactiveLabel ?? t("common.archived"))}
    </span>
  );
}
