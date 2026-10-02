"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { List, ScanText } from "lucide-react";
import { useLocale } from "@/i18n/client";

const TABS = [
  { href: "/factures", labelKey: "invoices.tabList", icon: List },
  { href: "/factures/extract", labelKey: "invoices.tabExtract", icon: ScanText },
];

export function InvoiceTabs() {
  const pathname = usePathname();
  const { t } = useLocale();

  return (
    <nav aria-label={t("nav.invoices")} className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand-400 ${
              active ? "text-brand-700" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {t(tab.labelKey)}
            {active && (
              <motion.span
                layoutId="invoice-tab-active"
                className="bg-brand-gradient absolute inset-x-0 bottom-0 h-0.5 rounded-full"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
