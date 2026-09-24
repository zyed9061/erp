"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale } from "@/i18n/client";

export interface ActiveFilterChip {
  key: string;
  label: string;
}

export function ActiveFilters({
  chips,
  onRemoveChip,
  onClearAll,
}: {
  chips: ActiveFilterChip[];
  onRemoveChip: (key: string) => void;
  onClearAll: () => void;
}) {
  const { t } = useLocale();

  if (chips.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 flex flex-wrap items-center gap-2 px-1"
    >
      <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{t("common.activeFilters")}</span>
      <AnimatePresence initial={false}>
        {chips.map((chip) => (
          <motion.span
            key={chip.key}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-1.5 rounded-full bg-brand-50 py-1 ps-3 pe-1.5 text-xs font-medium text-brand-700 ring-1 ring-brand-600/15 ring-inset"
          >
            {chip.label}
            <button
              type="button"
              onClick={() => onRemoveChip(chip.key)}
              aria-label={t("common.removeFilter", { label: chip.label })}
              className="rounded-full p-0.5 transition hover:bg-brand-100"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      <button
        type="button"
        onClick={onClearAll}
        className="ms-auto text-xs font-medium text-slate-500 transition hover:text-slate-900"
      >
        {t("common.clearAll")}
      </button>
    </motion.div>
  );
}
