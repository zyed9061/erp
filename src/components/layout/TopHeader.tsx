"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, Search, ChevronDown, User, Settings, LogOut } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { menuMotion } from "@/components/motion/Motion";


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
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/70 px-4 backdrop-blur-xl backdrop-saturate-150 sm:gap-4 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        aria-label={t("nav.openMenu")}
        className="btn-ghost -ms-1 h-10 w-10 px-0 md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="hidden min-w-0 flex-1 items-center sm:flex">
        <label htmlFor="global-search" className="sr-only">
          {t("nav.globalSearchPlaceholder")}
        </label>
        <div className="group relative w-full max-w-md">
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-brand-500"
            aria-hidden="true"
          />
          <input
            id="global-search"
            type="search"
            placeholder={t("nav.globalSearchPlaceholder")}
            className="w-full rounded-xl border border-transparent bg-slate-100/80 py-2.5 ps-10 pe-3 text-sm text-slate-700 transition placeholder:text-slate-400 hover:bg-slate-100 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10"
          />
        </div>
      </div>

      <div className="ms-auto flex items-center gap-1 sm:gap-2">
        <LanguageSwitcher />
        <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2.5 rounded-xl p-1 pe-2 text-sm transition hover:bg-slate-100"
          >
            <span className="bg-brand-gradient flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white shadow-md shadow-brand-500/30 ring-2 ring-white">
              {initials || "U"}
            </span>
            <span className="hidden text-start leading-tight lg:block">
              <span className="block font-medium text-slate-900">{userName}</span>
              <span className="block text-xs text-slate-500">{userEmail}</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                role="menu"
                {...menuMotion}
                className="absolute end-0 z-30 mt-2 w-60 origin-top-right overflow-hidden rounded-2xl bg-white p-1.5 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5 rtl:origin-top-left"
              >
                <div className="mb-1 border-b border-slate-100 px-3 py-2.5 lg:hidden">
                  <p className="truncate text-sm font-medium text-slate-900">{userName}</p>
                  <p className="truncate text-xs text-slate-500">{userEmail}</p>
                </div>
                <Link
                  href="/parametres"
                  role="menuitem"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                  onClick={() => setMenuOpen(false)}
                >
                  <User className="h-4 w-4 text-slate-400" aria-hidden="true" /> {t("nav.myProfile")}
                </Link>
                <Link
                  href="/parametres"
                  role="menuitem"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                  onClick={() => setMenuOpen(false)}
                >
                  <Settings className="h-4 w-4 text-slate-400" aria-hidden="true" /> {t("nav.settings")}
                </Link>
                <div className="my-1 h-px bg-slate-100" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={onSignOut}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-red-600 transition hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" /> {t("nav.signOut")}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
