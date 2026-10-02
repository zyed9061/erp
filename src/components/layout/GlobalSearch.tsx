"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Loader2, Package, Receipt, Search, SearchX, Undo2, Users, X, type LucideIcon } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { formatMontant } from "@/lib/format";
import { menuMotion } from "@/components/motion/Motion";
import type { SearchResponse, SearchResult } from "@/app/api/search/route";

const GROUPS: { key: keyof SearchResponse; labelKey: string; icon: LucideIcon }[] = [
  { key: "clients", labelKey: "nav.clients", icon: Users },
  { key: "invoices", labelKey: "nav.invoices", icon: Receipt },
  { key: "quotes", labelKey: "nav.quotes", icon: FileText },
  { key: "creditNotes", labelKey: "nav.creditNotes", icon: Undo2 },
  { key: "products", labelKey: "nav.products", icon: Package },
];

const DEBOUNCE_MS = 200;

/** Header search across clients, documents and products (Ctrl/⌘ + K to focus). */
export function GlobalSearch() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const flat = useMemo(
    () =>
      results
        ? GROUPS.flatMap((group) => results[group.key].map((result) => ({ ...result, group })))
        : [],
    [results],
  );

  useEffect(() => {
    // Platform check only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMobileOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
    function onClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // Clearing stale results when the query becomes too short to search.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        setResults((await res.json()) as SearchResponse);
        setActiveIndex(-1);
      } catch {
        if (!controller.signal.aborted) setResults(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function go(result: SearchResult) {
    setOpen(false);
    setMobileOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(result.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && flat.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (event.key === "ArrowUp" && flat.length) {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flat.length - 1 : i - 1));
    } else if (event.key === "Enter" && open && flat.length) {
      event.preventDefault();
      go(flat[Math.max(activeIndex, 0)]);
    } else if (event.key === "Escape") {
      if (open && query) setOpen(false);
      else {
        setQuery("");
        setMobileOpen(false);
        inputRef.current?.blur();
      }
    }
  }

  const showPanel = open && query.trim().length >= 2;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMobileOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        aria-label={t("nav.globalSearchPlaceholder")}
        className="btn-ghost h-11 w-11 px-0 sm:hidden"
      >
        <Search className="h-5 w-5" aria-hidden="true" />
      </button>

      <div
        ref={rootRef}
        className={`${
          mobileOpen ? "absolute inset-x-0 top-0 z-30 flex h-16 items-center gap-2 bg-white px-4" : "hidden"
        } min-w-0 flex-1 sm:static sm:flex sm:h-auto sm:bg-transparent sm:p-0`}
      >
        <div className="group relative w-full max-w-md">
          <label htmlFor={`${listboxId}-input`} className="sr-only">
            {t("nav.globalSearchPlaceholder")}
          </label>
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-brand-500"
            aria-hidden="true"
          />
          <input
            id={`${listboxId}-input`}
            ref={inputRef}
            type="search"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={showPanel}
            aria-controls={listboxId}
            aria-activedescendant={showPanel && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={t("nav.globalSearchPlaceholder")}
            className="h-11 w-full rounded-xl border border-transparent bg-slate-100/80 ps-10 pe-16 text-sm text-slate-700 transition placeholder:text-slate-500 hover:bg-slate-100 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 sm:h-10 [&::-webkit-search-cancel-button]:hidden"
          />
          <span className="pointer-events-none absolute end-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-brand-500" aria-hidden="true" />
            ) : (
              <kbd className="hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500 shadow-xs lg:inline-block">
                {isMac ? "⌘" : "Ctrl"} K
              </kbd>
            )}
          </span>

          <AnimatePresence>
            {showPanel && (
              <motion.div
                {...menuMotion}
                className="absolute inset-x-0 top-full z-40 mt-2 max-h-[min(28rem,70vh)] overflow-y-auto rounded-2xl bg-white p-1.5 shadow-2xl shadow-slate-900/15 ring-1 ring-slate-900/5"
              >
                <ul id={listboxId} role="listbox" aria-label={t("nav.globalSearchPlaceholder")}>
                  {GROUPS.map((group) => {
                    const items = results?.[group.key] ?? [];
                    if (!items.length) return null;
                    const Icon = group.icon;
                    return (
                      <li key={group.key} role="presentation">
                        <p
                          role="presentation"
                          className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase"
                        >
                          {t(group.labelKey)}
                        </p>
                        <ul role="group" aria-label={t(group.labelKey)}>
                          {items.map((item) => {
                            const i = flat.findIndex((entry) => entry.group.key === group.key && entry.id === item.id);
                            const active = i === activeIndex;
                            return (
                              <li
                                key={item.id}
                                id={optionId(i)}
                                role="option"
                                aria-selected={active}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => go(item)}
                                onMouseEnter={() => setActiveIndex(i)}
                                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                                  active ? "bg-brand-50 text-brand-900" : "text-slate-700"
                                }`}
                              >
                                <span
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                    active ? "bg-white text-brand-600 shadow-xs" : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  <Icon className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium">{item.title}</span>
                                  {item.subtitle && <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>}
                                </span>
                                {item.amount !== null && (
                                  <span className="shrink-0 text-xs font-medium text-slate-500 tabular-nums">
                                    {formatMontant(item.amount, "TND", locale)}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
                {!loading && results && flat.length === 0 && (
                  <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <SearchX className="h-6 w-6 text-slate-400" aria-hidden="true" />
                    <p className="text-sm text-slate-600">{t("search.noResults", { query: query.trim() })}</p>
                  </div>
                )}
                {loading && !results && (
                  <p className="px-4 py-6 text-center text-sm text-slate-500">{t("search.searching")}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {mobileOpen && (
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              setQuery("");
            }}
            aria-label={t("common.close")}
            className="btn-ghost h-11 w-11 shrink-0 px-0 sm:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>
    </>
  );
}
