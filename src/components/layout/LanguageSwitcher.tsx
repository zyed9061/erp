"use client";

import { useEffect, useRef, useState } from "react";
import { Languages, Check, ChevronDown } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";

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
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
      >
        <Languages className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{LOCALE_LABELS[locale]}</span>
        <ChevronDown className="h-3.5 w-3.5 text-neutral-400" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 z-30 mt-2 w-40 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
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
              className="flex w-full items-center justify-between px-3 py-2 text-start text-sm text-neutral-700 hover:bg-neutral-50"
            >
              {LOCALE_LABELS[code]}
              {locale === code && <Check className="h-4 w-4 text-brand-700" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
