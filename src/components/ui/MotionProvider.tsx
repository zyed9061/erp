"use client";

import { MotionConfig } from "motion/react";

/**
 * `reducedMotion="user"` : pour qui a active « animations reduites » au niveau
 * du systeme, motion desactive les animations de transformation (deplacements,
 * echelles) et ne conserve que les fondus.
 *
 * Cela ne suffit pas pour les boucles infinies d'opacite (halos, pastille en
 * retard, vignette flottante) : celles-la sont coupees explicitement dans
 * chaque composant via `useReducedMotion()`.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
