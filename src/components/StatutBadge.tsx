const STYLES: Record<string, string> = {
  BROUILLON: "bg-neutral-100 text-neutral-700",
  ENVOYE: "bg-blue-50 text-blue-700",
  ENVOYEE: "bg-blue-50 text-blue-700",
  ACCEPTE: "bg-green-50 text-green-700",
  PAYEE: "bg-green-50 text-green-700",
  REFUSE: "bg-red-50 text-red-700",
  ANNULEE: "bg-red-50 text-red-700",
  EXPIRE: "bg-amber-50 text-amber-700",
  EN_RETARD: "bg-amber-50 text-amber-700",
  PARTIELLEMENT_PAYEE: "bg-amber-50 text-amber-700",
  CONVERTI: "bg-purple-50 text-purple-700",
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
