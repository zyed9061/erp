"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { useLocale } from "@/i18n/client";

interface ToastMessage {
  id: number;
  type: "success" | "error";
  text: string;
}

interface ToastContextValue {
  showSuccess: (text: string) => void;
  showError: (text: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Portal must not render during SSR/hydration (no document.body yet on the server);
    // flip after mount so the client's first paint matches the server's.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const push = useCallback((type: ToastMessage["type"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, text }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const showSuccess = useCallback((text: string) => push("success", text), [push]);
  const showError = useCallback((text: string) => push("error", text), [push]);
  const value = useMemo<ToastContextValue>(
    () => ({ showSuccess, showError }),
    [showSuccess, showError],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            className="fixed inset-x-4 bottom-4 z-[100] flex flex-col gap-2 sm:inset-x-auto sm:end-6 sm:bottom-6 sm:w-96"
          >
            <AnimatePresence initial={false}>
              {toasts.map((toast) => (
                <motion.div
                  key={toast.id}
                  layout
                  role="status"
                  initial={{ opacity: 0, y: 24, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-slate-900/95 px-4 py-3.5 text-sm text-white shadow-2xl shadow-slate-950/30 ring-1 ring-white/10 backdrop-blur-xl"
                >
                  {toast.type === "success" ? (
                    <motion.span
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.08 }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/40"
                    >
                      <CheckCircle2 className="h-4.5 w-4.5" aria-hidden="true" />
                    </motion.span>
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-rose-500 to-red-500 shadow-lg shadow-rose-500/40">
                      <AlertTriangle className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                  )}
                  <span className="flex-1 font-medium">{toast.text}</span>
                  <button
                    type="button"
                    aria-label={t("common.close")}
                    onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
                    className="shrink-0 rounded-lg p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {/* Time-left bar, matching the 4 s auto-dismiss. */}
                  <motion.span
                    aria-hidden="true"
                    className={`absolute bottom-0 start-0 h-0.5 ${toast.type === "success" ? "bg-emerald-400" : "bg-rose-400"}`}
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: 4, ease: "linear" }}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
