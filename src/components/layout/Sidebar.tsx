"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronsLeft, ChevronsRight, Receipt } from "lucide-react";
import { NAV_ITEMS, isNavItemActive } from "@/lib/nav";
import { useLocale } from "@/i18n/client";

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLocale();

  // Close the mobile drawer after navigating.
  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // The collapsed rail only applies from md up; the mobile drawer is always full width.
  const railOnly = collapsed && !mobileOpen;

  return (
    <>
      <AnimatePresence>
        {mobileOpen && (
          <motion.button
            type="button"
            aria-label={t("common.close")}
            className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-sm md:hidden"
            onClick={onCloseMobile}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed inset-y-0 start-0 z-40 flex w-64 flex-col bg-slate-950 text-slate-300 shadow-2xl transition-[width,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:shadow-none ${
          collapsed ? "md:w-[72px]" : ""
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"} md:translate-x-0 md:rtl:translate-x-0`}
      >
        {/* Soft brand glows behind the navigation (clipped separately so rail tooltips can overflow). */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -start-20 h-64 w-64 rounded-full bg-brand-600/30 blur-3xl" />
          <div className="absolute -bottom-32 -end-24 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
        </div>

        <div
          className={`relative flex h-16 shrink-0 items-center border-b border-white/5 px-4 ${
            railOnly ? "justify-center" : "justify-between"
          }`}
        >
          {!railOnly && (
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <span className="bg-brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-lg shadow-brand-600/40 ring-1 ring-white/20">
                <Receipt className="h-4.5 w-4.5 text-white" aria-hidden="true" />
              </span>
              <span className="truncate text-[15px] font-semibold tracking-tight text-white">{t("nav.brand")}</span>
            </Link>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={t(collapsed ? "common.view" : "common.close")}
            aria-pressed={collapsed}
            className="hidden rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white md:inline-flex"
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            ) : (
              <ChevronsLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            )}
          </button>
        </div>

        <nav className={`relative flex-1 space-y-1 px-3 py-5 ${railOnly ? "" : "overflow-y-auto"}`} aria-label={t("nav.dashboard")}>
          {NAV_ITEMS.map((item, index) => {
            const active = isNavItemActive(pathname, item.href);
            const Icon = item.icon;
            const label = t(item.labelKey);
            return (
              <motion.div
                key={item.href}
                className="group relative"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * index, duration: 0.35 }}
              >
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ${
                    active ? "text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
                  } ${railOnly ? "justify-center" : ""}`}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-xl bg-linear-to-r from-brand-600/90 to-violet-600/70 shadow-lg shadow-brand-900/50 ring-1 ring-white/15"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <Icon
                    className={`relative h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                      active ? "text-white" : ""
                    }`}
                    aria-hidden="true"
                  />
                  {!railOnly && <span className="relative truncate">{label}</span>}
                </Link>
                {railOnly && (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute start-full top-1/2 z-50 ms-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl ring-1 ring-white/10 transition-opacity group-hover:opacity-100"
                  >
                    {label}
                  </span>
                )}
              </motion.div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
