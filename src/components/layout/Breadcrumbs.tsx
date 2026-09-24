"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ROUTE_LABEL_KEYS } from "@/lib/nav";
import { useLocale } from "@/i18n/client";
import type { Translator } from "@/i18n/translate";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

function computeFromPath(pathname: string, t: Translator, lastLabelOverride?: string): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);
  const items: BreadcrumbItem[] = [{ label: t("breadcrumb.home"), href: "/" }];

  let acc = "";
  segments.forEach((segment, index) => {
    acc += `/${segment}`;
    const isLast = index === segments.length - 1;
    const labelKey = ROUTE_LABEL_KEYS[segment];
    const isDynamicId = !labelKey && segment !== "pdf";
    let label = labelKey ? t(labelKey) : segment;

    if (isDynamicId) {
      label = isLast && lastLabelOverride ? lastLabelOverride : t("breadcrumb.details");
    }
    if (segment === "pdf") label = t("breadcrumb.pdf");

    items.push({ label, href: isLast ? undefined : acc });
  });

  return items;
}

export function Breadcrumbs({ lastLabel }: { lastLabel?: string }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const items = computeFromPath(pathname, t, lastLabel);

  return (
    <nav aria-label="breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-xs font-medium text-slate-500 sm:text-[13px]">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100 text-slate-300" aria-hidden="true" />
            )}
            {item.href ? (
              <Link href={item.href} className="rounded-md px-1.5 py-0.5 transition hover:bg-slate-100 hover:text-slate-900">
                {item.label}
              </Link>
            ) : (
              <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-brand-700" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
