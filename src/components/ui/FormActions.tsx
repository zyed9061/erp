"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Check, Loader2 } from "lucide-react";
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
    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-end">
      <Link href={cancelHref} className="btn-secondary h-10 px-5">
        {t("common.cancel")}
      </Link>
      <SubmitButton label={resolvedSubmitLabel} />
    </div>
  );
}

/** Primary submit button that shows a spinner and disables itself while its form is submitting. */
export function SubmitButton({
  label,
  pendingLabel,
  className = "",
  icon = true,
}: {
  label: string;
  pendingLabel?: string;
  className?: string;
  icon?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`btn-primary h-10 px-5 ${className}`}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        icon && <Check className="h-4 w-4" aria-hidden="true" />
      )}
      {pending && pendingLabel ? pendingLabel : label}
    </button>
  );
}
