"use client";

import { X } from "lucide-react";
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

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        {t("common.activeFilters")}
      </span>
      {chips.length === 0 && (
        <span className="text-sm text-neutral-400">{t("common.noFilterApplied")}</span>
      )}
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="flex items-center gap-1.5 rounded-full bg-brand-50 py-1 ps-3 pe-1.5 text-xs font-medium text-brand-800"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => onRemoveChip(chip.key)}
            aria-label={t("common.removeFilter", { label: chip.label })}
            className="rounded-full p-0.5 hover:bg-brand-100"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      {chips.length > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="ms-auto text-xs font-medium text-neutral-500 hover:text-neutral-800 hover:underline"
        >
          {t("common.clearAll")}
        </button>
      )}
    </div>
  );
}
