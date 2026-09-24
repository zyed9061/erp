"use client";

import { useLocale } from "@/i18n/client";

const TONES = {
  slate: "bg-slate-100 text-slate-600 ring-slate-500/15 [--dot:var(--color-slate-400)]",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/15 [--dot:var(--color-sky-500)]",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 [--dot:var(--color-emerald-500)]",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/15 [--dot:var(--color-violet-500)]",
  red: "bg-rose-50 text-rose-700 ring-rose-600/15 [--dot:var(--color-rose-500)]",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20 [--dot:var(--color-amber-500)]",
  muted: "bg-slate-100 text-slate-500 ring-slate-500/10 [--dot:var(--color-slate-300)]",
};

const STYLES: Record<string, string> = {
  BROUILLON: TONES.slate,
  ENVOYE: TONES.blue,
  ENVOYEE: TONES.blue,
  ACCEPTE: TONES.green,
  PAYEE: TONES.green,
  APPLIQUE: TONES.green,
  REMBOURSE: TONES.violet,
  REFUSE: TONES.red,
  ANNULEE: TONES.muted,
  ANNULE: TONES.muted,
  EXPIRE: TONES.amber,
  EN_RETARD: TONES.red,
  PARTIELLEMENT_PAYEE: TONES.amber,
  CONVERTI: TONES.violet,
  EMIS: TONES.blue,
};

const pill =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset";
const dot = <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--dot)" aria-hidden="true" />;

export function StatutBadge({ statut }: { statut: string }) {
  const { t } = useLocale();
  return (
    <span
      className={`${pill} ${STYLES[statut] ?? TONES.slate}`}
    >
      {dot}
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
      className={`${pill} ${actif ? TONES.green : TONES.slate}`}
    >
      {dot}
      {actif ? t("common.active") : (inactiveLabel ?? t("common.archived"))}
    </span>
  );
}
