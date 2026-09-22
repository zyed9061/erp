"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
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

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label={t("common.close")}
          className="fixed inset-0 z-30 bg-neutral-900/40 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-e border-neutral-200 bg-white transition-all duration-200 ${
          collapsed ? "w-[68px]" : "w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="flex h-16 items-center justify-between border-b border-neutral-100 px-4">
          {!collapsed && (
            <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-neutral-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-700 text-xs font-bold text-white">
                F
              </span>
              {t("nav.brand")}
            </span>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={t(collapsed ? "common.view" : "common.close")}
            aria-pressed={collapsed}
            className={`hidden rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 md:inline-flex ${collapsed ? "mx-auto" : ""}`}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            ) : (
              <ChevronsLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4" aria-label={t("nav.dashboard")}>
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const Icon = item.icon;
            const label = t(item.labelKey);
            return (
              <div key={item.href} className="group relative">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                    active
                      ? "bg-brand-50 text-neutral-900"
                      : "text-neutral-600 hover:bg-brand-50/60 hover:text-neutral-900"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {!collapsed && <span>{label}</span>}
                </Link>
                {collapsed && (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute start-full top-1/2 z-50 ms-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                  >
                    {label}
                  </span>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
