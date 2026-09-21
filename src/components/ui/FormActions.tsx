"use client";

import Link from "next/link";
import { useLocale } from "@/i18n/client";

export function FormActions({
  cancelHref,
  submitLabel,
}: {
  cancelHref: string;
  submitLabel?: string;
}) {
  const { t } = useLocale();
  const resolvedSubmitLabel = submitLabel ?? t("common.save");

  return (
    <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-5">
      <Link
        href={cancelHref}
        className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 shadow-xs hover:bg-neutral-50"
      >
        {t("common.cancel")}
      </Link>
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center rounded-md bg-brand-700 px-4 text-sm font-medium text-white shadow-xs hover:bg-brand-800"
      >
        {resolvedSubmitLabel}
      </button>
    </div>
  );
}
