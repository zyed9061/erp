"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

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
            className="fixed bottom-4 right-4 z-[100] flex w-80 max-w-[90vw] flex-col gap-2"
          >
            {toasts.map((toast) => (
              <div
                key={toast.id}
                role="status"
                className="flex items-center gap-3 rounded-xl bg-brand-700 px-4 py-3 text-sm text-white shadow-lg"
              >
                {toast.type === "success" ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/70">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/70">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}
                <span className="flex-1 font-medium">{toast.text}</span>
                <span className="h-6 w-px shrink-0 bg-white/40" aria-hidden="true" />
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
                  className="shrink-0 text-white/70 hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
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
