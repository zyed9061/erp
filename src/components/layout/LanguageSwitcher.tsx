"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Languages, Check, ChevronDown } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { menuMotion } from "@/components/motion/Motion";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("nav.language")}
        title={t("nav.language")}
        className="flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <Languages className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{LOCALE_LABELS[locale]}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
      {open && (
        <motion.div
          role="menu"
          {...menuMotion}
          className="absolute end-0 z-30 mt-2 w-44 origin-top-right overflow-hidden rounded-2xl bg-white p-1.5 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5 rtl:origin-top-left"
        >
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setLocale(code);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm transition ${
                locale === code ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {LOCALE_LABELS[code]}
              {locale === code && <Check className="h-4 w-4 text-brand-600" aria-hidden="true" />}
            </button>
          ))}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
