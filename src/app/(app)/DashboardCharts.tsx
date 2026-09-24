"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { formatMontant } from "@/lib/format";
import type { Locale } from "@/i18n/config";

const EASE = [0.22, 1, 0.36, 1] as const;

export function RevenueChart({
  data,
  title,
  locale,
  tone = "brand",
}: {
  data: { label: string; total: number }[];
  title: string;
  locale: Locale;
  tone?: "brand" | "emerald";
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.total));
  const bar = tone === "emerald" ? "from-emerald-300 to-emerald-600" : "from-violet-400 to-brand-600";

  return (
    <div role="img" aria-label={title} onMouseLeave={() => setHovered(null)}>
      <div className="relative h-56">
        {/* Gridlines */}
        <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-t border-dashed border-slate-100" />
          ))}
        </div>
        <div className={`relative flex h-full items-end ${data.length > 6 ? "gap-1 sm:gap-2" : "gap-3 sm:gap-5"}`}>
          {data.map((d, i) => {
            const pct = d.total > 0 ? Math.max(2, (d.total / max) * 100) : 0;
            const active = hovered === i;
            return (
              <div
                key={`${d.label}-${i}`}
                className="group relative flex h-full flex-1 items-end rounded-lg bg-slate-50/80"
                onMouseEnter={() => setHovered(i)}
                title={`${d.label}: ${formatMontant(d.total, "TND", locale)}`}
              >
                <motion.div
                  className={`w-full rounded-lg bg-linear-to-t ${bar} shadow-sm transition-opacity duration-200 ${
                    hovered !== null && !active ? "opacity-45" : ""
                  }`}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${pct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.06 * i, ease: EASE }}
                />
                {active && (
                  <motion.span
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="pointer-events-none absolute start-1/2 z-10 -translate-x-1/2 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-white shadow-lg rtl:translate-x-1/2"
                    style={{ bottom: `calc(${pct}% + 6px)` }}
                  >
                    {formatMontant(d.total, "TND", locale)}
                  </motion.span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className={`mt-2 flex ${data.length > 6 ? "gap-1 sm:gap-2" : "gap-3 sm:gap-5"}`}>
        {data.map((d, i) => (
          <span
            key={`${d.label}-${i}`}
            className={`min-w-0 flex-1 truncate text-center ${data.length > 6 ? "text-[10px] tracking-tighter" : "text-[11px]"} ${hovered === i ? "font-semibold text-slate-900" : "text-slate-500"}`}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, [string, string]> = {
  BROUILLON: ["#cbd5e1", "#94a3b8"],
  ENVOYEE: ["#60a5fa", "#2563eb"],
  PARTIELLEMENT_PAYEE: ["#fcd34d", "#f59e0b"],
  PAYEE: ["#6ee7b7", "#10b981"],
  EN_RETARD: ["#fda4af", "#e11d48"],
  ANNULEE: ["#94a3b8", "#475569"],
};

export function StatusDistributionChart({
  data,
}: {
  data: { label: string; statut: string; count: number }[];
}) {
  const total = Math.max(1, data.reduce((sum, d) => sum + d.count, 0));

  return (
    <div className="space-y-3.5">
      {data.map((d, i) => {
        const [from, to] = STATUS_COLORS[d.statut] ?? ["#cbd5e1", "#94a3b8"];
        const pct = (d.count / total) * 100;
        return (
          <div key={d.statut} className="group">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2 text-slate-600">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: to }} />
                <span className="truncate">{d.label}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold text-slate-900">{d.count}</span>
                <span className="ms-1.5 text-slate-400">{Math.round(pct)}%</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${from}, ${to})` }}
                initial={{ width: 0 }}
                whileInView={{ width: `${pct}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: 0.07 * i, ease: EASE }}
                title={`${d.label}: ${d.count}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
