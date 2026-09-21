"use client";

import { useLocale } from "@/i18n/client";

const STYLES: Record<string, string> = {
  BROUILLON: "bg-neutral-100 text-neutral-600",
  ENVOYE: "bg-blue-50 text-blue-700",
  ENVOYEE: "bg-blue-50 text-blue-700",
  ACCEPTE: "bg-green-50 text-green-700",
  PAYEE: "bg-green-50 text-green-700",
  APPLIQUE: "bg-green-50 text-green-700",
  REMBOURSE: "bg-purple-50 text-purple-700",
  REFUSE: "bg-red-50 text-red-700",
  ANNULEE: "bg-neutral-200 text-neutral-600",
  ANNULE: "bg-neutral-200 text-neutral-600",
  EXPIRE: "bg-amber-50 text-amber-700",
  EN_RETARD: "bg-red-50 text-red-700",
  PARTIELLEMENT_PAYEE: "bg-amber-50 text-amber-700",
  CONVERTI: "bg-purple-50 text-purple-700",
  EMIS: "bg-blue-50 text-blue-700",
};

export function StatutBadge({ statut }: { statut: string }) {
  const { t } = useLocale();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[statut] ?? "bg-neutral-100 text-neutral-700"}`}
    >
      {t(`status.${statut}`)}
    </span>
  );
}

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
