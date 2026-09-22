"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { EASE } from "./motion";
import { IconPlus } from "./icons";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Degrade de fond, classes completes (ex. "from-sky-500 via-blue-600 to-indigo-600"). */
  accent: string;
  /** Couleur de l'ombre portee, classe complete (ex. "shadow-blue-600/20"). */
  glow: string;
  /** Couleur du texte du bouton, classe complete (ex. "text-blue-700"). */
  actionText?: string;
  action?: { href: string; label: string };
};

export function PageHero({
  eyebrow,
  title,
  subtitle,
  accent,
  glow,
  actionText = "text-violet-700",
  action,
}: Props) {
  // Les halos tournent en boucle : on les fige en mouvement reduit.
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${accent} px-6 py-7 shadow-lg ${glow} sm:px-8`}
    >
      {/* Halos decoratifs en respiration lente */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/20 blur-3xl"
        animate={reduceMotion ? { scale: 1, opacity: 0.45 } : { scale: [1, 1.18, 1], opacity: [0.35, 0.6, 0.35] }}
        transition={
          reduceMotion ? { duration: 0 } : { duration: 9, repeat: Infinity, ease: "easeInOut" }
        }
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-white/15 blur-3xl"
        animate={reduceMotion ? { scale: 1, opacity: 0.4 } : { scale: [1.1, 1, 1.1], opacity: [0.3, 0.55, 0.3] }}
        transition={
          reduceMotion ? { duration: 0 } : { duration: 11, repeat: Infinity, ease: "easeInOut" }
        }
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            {eyebrow}
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-2 text-sm text-white/80">{subtitle}</p>
        </div>

        {action && (
          <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
            <Link
              href={action.href}
              className={`group inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold ${actionText} shadow-md shadow-black/20 transition-shadow duration-300 hover:shadow-xl`}
            >
              <IconPlus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
              {action.label}
            </Link>
          </motion.div>
        )}
      </div>
    </motion.section>
  );
}
