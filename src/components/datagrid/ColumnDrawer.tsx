"use client";

import { X, ArrowUp, ArrowDown, Pin } from "lucide-react";
import { useLocale } from "@/i18n/client";

export interface ColumnDrawerItem {
  colId: string;
  headerName: string;
  visible: boolean;
  pinned: boolean;
}

export function ColumnDrawer({
  open,
  items,
  onToggleVisible,
  onMove,
  onTogglePin,
  onReset,
  onClose,
}: {
  open: boolean;
  items: ColumnDrawerItem[];
  onToggleVisible: (colId: string) => void;
  onMove: (colId: string, direction: "up" | "down") => void;
  onTogglePin: (colId: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { t } = useLocale();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end rtl:justify-start">
      <button
        type="button"
        aria-label={t("common.closeColumnPanel")}
        className="absolute inset-0 bg-neutral-900/30"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={t("common.columns")}
        className="relative flex h-full w-full max-w-sm flex-col border-s border-neutral-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">{t("common.columns")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {items.map((item, index) => (
            <div
              key={item.colId}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-neutral-50"
            >
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={item.visible}
                  onChange={() => onToggleVisible(item.colId)}
                  className="h-4 w-4 rounded border-neutral-300 text-brand-700 focus:ring-brand-600"
                />
                <span className="truncate">{item.headerName}</span>
              </label>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onTogglePin(item.colId)}
                  aria-label={t(item.pinned ? "common.unpinColumn" : "common.pinColumn")}
                  aria-pressed={item.pinned}
                  className={`rounded p-1 hover:bg-neutral-100 ${item.pinned ? "text-brand-700" : "text-neutral-400"}`}
                >
                  <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(item.colId, "up")}
                  disabled={index === 0}
                  aria-label={t("common.moveUp")}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(item.colId, "down")}
                  disabled={index === items.length - 1}
                  aria-label={t("common.moveDown")}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-neutral-100 px-4 py-3">
          <button
            type="button"
            onClick={onReset}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {t("common.resetColumns")}
          </button>
        </div>
      </div>
    </div>
  );
}
