"use client";

import { Receipt } from "lucide-react";
import { useLocale } from "@/i18n/client";

/** Sticky footer of the app shell. */
export function AppFooter() {
  const { t } = useLocale();

  return (
    <footer className="sticky bottom-0 z-20 flex h-[var(--footer-h)] shrink-0 items-center gap-3 border-t border-slate-200/70 bg-white/75 px-4 backdrop-blur-xl backdrop-saturate-150 sm:px-6 lg:px-8">
      <p className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
        <Receipt className="h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden="true" />
        <span className="truncate">
          © {new Date().getFullYear()} {t("nav.brand")}
        </span>
      </p>
    </footer>
  );
}
