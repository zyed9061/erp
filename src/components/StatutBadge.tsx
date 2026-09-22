const STYLES: Record<string, string> = {
  BROUILLON: "bg-neutral-100 text-neutral-700",
  ENVOYE: "bg-info-soft text-info",
  ENVOYEE: "bg-info-soft text-info",
  ACCEPTE: "bg-success-soft text-success",
  PAYEE: "bg-success-soft text-success",
  REFUSE: "bg-danger-soft text-danger",
  ANNULEE: "bg-danger-soft text-danger",
  EXPIRE: "bg-warning-soft text-warning",
  EN_RETARD: "bg-warning-soft text-warning",
  PARTIELLEMENT_PAYEE: "bg-warning-soft text-warning",
  CONVERTI: "bg-special-soft text-special",
};

const LABELS: Record<string, string> = {
  BROUILLON: "Brouillon",
  ENVOYE: "Envoye",
  ENVOYEE: "Envoyee",
  ACCEPTE: "Accepte",
  PAYEE: "Payee",
  REFUSE: "Refuse",
  ANNULEE: "Annulee",
  EXPIRE: "Expire",
  EN_RETARD: "En retard",
  PARTIELLEMENT_PAYEE: "Partiellement payee",
  CONVERTI: "Converti",
};

export function StatutBadge({ statut }: { statut: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[statut] ?? "bg-neutral-100 text-neutral-700"}`}
    >
      {LABELS[statut] ?? statut}
    </span>
  );
}
