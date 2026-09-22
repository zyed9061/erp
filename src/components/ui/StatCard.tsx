"use client";

import { motion } from "motion/react";
import { EASE } from "./motion";
import { AnimatedNumber } from "./AnimatedNumber";

export type StatCardProps = {
  label: string;
  value: number;
  format: (n: number) => string;
  hint?: string;
  /** Degrade, classes completes (ex. "from-indigo-500 to-violet-500"). */
  accent: string;
  /** Ombre au survol, classe complete (ex. "hover:shadow-violet-500/10"). */
  glow: string;
  icon: React.ReactNode;
  index: number;
};

export function StatCard({
  label,
  value,
  format,
  hint,
  accent,
  glow,
  icon,
  index,
}: StatCardProps) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
      }}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className={`group relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200/70 transition-shadow duration-300 hover:shadow-xl ${glow}`}
    >
      {/* Liseré de couleur en haut de la carte */}
      <span
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent} opacity-80`}
        aria-hidden
      />
      {/* Halo diffus revele au survol */}
      <span
        className={`pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${accent} opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-25`}
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            {label}
          </p>
          <p className="mt-2 truncate text-2xl font-semibold text-neutral-900">
            <AnimatedNumber value={value} format={format} delay={0.15 + index * 0.08} />
          </p>
          {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}
        >
          {icon}
        </span>
      </div>
    </motion.div>
  );
}
