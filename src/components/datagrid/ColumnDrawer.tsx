"use client";

import { X, ArrowUp, ArrowDown, Pin } from "lucide-react";
import { motion } from "framer-motion";
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
  const { t, dir } = useLocale();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end rtl:justify-start">
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        type="button"
        aria-label={t("common.closeColumnPanel")}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: dir === "rtl" ? -48 : 48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        role="dialog"
        aria-label={t("common.columns")}
        className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-2xl shadow-slate-950/20 sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{t("common.columns")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="btn-ghost h-8 w-8 px-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {items.map((item, index) => (
            <div
              key={item.colId}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-slate-50"
            >
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={item.visible}
                  onChange={() => onToggleVisible(item.colId)}
                  className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                />
                <span className="truncate">{item.headerName}</span>
              </label>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onTogglePin(item.colId)}
                  aria-label={t(item.pinned ? "common.unpinColumn" : "common.pinColumn")}
                  aria-pressed={item.pinned}
                  className={`rounded p-1 hover:bg-slate-100 ${item.pinned ? "text-brand-700" : "text-slate-400"}`}
                >
                  <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(item.colId, "up")}
                  disabled={index === 0}
                  aria-label={t("common.moveUp")}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(item.colId, "down")}
                  disabled={index === items.length - 1}
                  aria-label={t("common.moveDown")}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onReset}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("common.resetColumns")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
