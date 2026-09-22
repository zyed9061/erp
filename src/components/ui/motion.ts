// Tokens de mouvement partages par toutes les pages de liste.

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Conteneur d'une liste : decale l'entree de ses enfants. */
export const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.1 } },
};

/** Ligne de tableau ou carte mobile. */
export const rowVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
};

/** Grille d'indicateurs. */
export const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } },
};
