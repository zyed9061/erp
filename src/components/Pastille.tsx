/**
 * Pastille de la couleur d'un element. A placer sous un parent `.item-color`
 * (dont le style en ligne vient de `styleCouleur`).
 * - `rond` : avatar circulaire (clients, produits) ; `carre` : puce (documents).
 */
export function Pastille({
  texte,
  forme = "rond",
  taille = "sm",
}: {
  texte: string;
  forme?: "rond" | "carre";
  taille?: "sm" | "lg";
}) {
  const dimension = taille === "lg" ? "size-12 text-xl" : "size-7 text-xs";
  const arrondi = forme === "rond" ? "rounded-full" : "rounded-md";
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center font-bold bg-(--item-color) text-(--item-ink) ${dimension} ${arrondi}`}
    >
      {texte.trim().charAt(0).toUpperCase()}
    </span>
  );
}
