"use client";

import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { EASE } from "./motion";

type Props = {
  value: number;
  format: (n: number) => string;
  duration?: number;
  delay?: number;
};

/** Compte de 0 vers `value` au montage : aucun chiffre n'apparait "froid". */
export function AnimatedNumber({ value, format, duration = 1.1, delay = 0 }: Props) {
  const reduceMotion = useReducedMotion();
  // Toujours 0 au premier rendu : `useReducedMotion` lit matchMedia des le rendu
  // client alors que le serveur renvoie toujours false. Brancher la valeur initiale
  // ici casserait l'hydratation pour qui a "animations reduites" active.
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    // En mouvement reduit on passe par la meme animation, en duree nulle :
    // la valeur se cale immediatement, sans setState synchrone dans l'effet.
    const controls = animate(0, value, {
      duration: reduceMotion ? 0 : duration,
      delay: reduceMotion ? 0 : delay,
      ease: EASE,
      onUpdate: (latest) => setDisplay(latest),
    });
    return () => controls.stop();
  }, [value, duration, delay, reduceMotion]);

  return <span className="tabular-nums">{format(display)}</span>;
}
