"use client";

import { X } from "lucide-react";
import { useLocale } from "@/i18n/client";
import type { GridFilterField, SetFilterValue } from "./types";

export function FilterDrawer({
  open,
  fields,
  setFilters,
  dateRangeFilters,
  onToggleSetValue,
  onChangeDateRange,
  onClose,
  onClearAll,
}: {
  open: boolean;
  fields: GridFilterField[];
  setFilters: Record<string, SetFilterValue>;
  dateRangeFilters: Record<string, { from?: string; to?: string }>;
  onToggleSetValue: (fieldKey: string, value: string) => void;
  onChangeDateRange: (fieldKey: string, range: { from?: string; to?: string }) => void;
  onClose: () => void;
  onClearAll: () => void;
}) {
  const { t } = useLocale();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end rtl:justify-start">
      <button
        type="button"
        aria-label={t("common.closeFilterPanel")}
        className="absolute inset-0 bg-neutral-900/30"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={t("common.filters")}
        className="relative flex h-full w-full max-w-sm flex-col border-s border-neutral-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">{t("common.filters")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
          {fields.length === 0 && (
            <p className="text-sm text-neutral-500">{t("common.columnFilterHint")}</p>
          )}

          {fields.map((field) => (
            <div key={field.key}>
              <h3 className="mb-2 text-sm font-medium text-neutral-800">{field.label}</h3>
              {field.type === "set" && (
                <div className="space-y-1.5">
                  {field.options?.map((option) => {
                    const checked = setFilters[field.key]?.includes(option.value) ?? false;
                    return (
                      <label
                        key={option.value}
                        className="flex items-center gap-2 text-sm text-neutral-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleSetValue(field.key, option.value)}
                          className="h-4 w-4 rounded border-neutral-300 text-brand-700 focus:ring-brand-600"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                  {!field.options?.length && (
                    <p className="text-xs text-neutral-400">{t("common.noValueAvailable")}</p>
                  )}
                </div>
              )}
              {field.type === "dateRange" && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    aria-label={`${field.label} - ${t("common.dateFrom")}`}
                    value={dateRangeFilters[field.key]?.from ?? ""}
                    onChange={(e) =>
                      onChangeDateRange(field.key, {
                        ...dateRangeFilters[field.key],
                        from: e.target.value || undefined,
                      })
                    }
                    className="input text-xs"
                  />
                  <span className="text-neutral-400">-</span>
                  <input
                    type="date"
                    aria-label={`${field.label} - ${t("common.dateTo")}`}
                    value={dateRangeFilters[field.key]?.to ?? ""}
                    onChange={(e) =>
                      onChangeDateRange(field.key, {
                        ...dateRangeFilters[field.key],
                        to: e.target.value || undefined,
                      })
                    }
                    className="input text-xs"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-between gap-2 border-t border-neutral-100 px-4 py-3">
          <button
            type="button"
            onClick={onClearAll}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {t("common.clearAll")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
          >
            {t("common.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
