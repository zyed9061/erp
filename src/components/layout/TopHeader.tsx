"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, Search, ChevronDown, User, Settings, LogOut } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

export function TopHeader({
  userName,
  userEmail,
  onOpenMobileMenu,
  onSignOut,
}: {
  userName: string;
  userEmail: string;
  onOpenMobileMenu: () => void;
  onSignOut: () => void;
}) {
  const { t } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-neutral-200 bg-white px-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        aria-label={t("nav.openMenu")}
        className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="hidden min-w-0 flex-1 items-center sm:flex">
        <label htmlFor="global-search" className="sr-only">
          {t("nav.globalSearchPlaceholder")}
        </label>
        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
            aria-hidden="true"
          />
          <input
            id="global-search"
            type="search"
            placeholder={t("nav.globalSearchPlaceholder")}
            className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-2 ps-9 pe-3 text-sm text-neutral-700 placeholder:text-neutral-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="ms-auto flex items-center gap-2">
        <LanguageSwitcher />
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
              {initials || "U"}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block font-medium text-neutral-900">{userName}</span>
              <span className="block text-xs text-neutral-500">{userEmail}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-neutral-400" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute end-0 z-30 mt-2 w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
            >
              <Link
                href="/parametres"
                role="menuitem"
                className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                onClick={() => setMenuOpen(false)}
              >
                <User className="h-4 w-4" aria-hidden="true" /> {t("nav.myProfile")}
              </Link>
              <Link
                href="/parametres"
                role="menuitem"
                className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                onClick={() => setMenuOpen(false)}
              >
                <Settings className="h-4 w-4" aria-hidden="true" /> {t("nav.settings")}
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={onSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" /> {t("nav.signOut")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
