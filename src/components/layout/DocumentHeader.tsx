import { FileDown, type LucideIcon } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { StatutBadge } from "@/components/StatutBadge";
import { FadeIn } from "@/components/motion/Motion";

/** Title block shared by the invoice, quote and credit-note detail pages. */
export function DocumentHeader({
  icon: Icon,
  numero,
  subtitle,
  statut,
  pdfHref,
  pdfLabel,
  children,
}: {
  icon: LucideIcon;
  numero: string;
  subtitle: React.ReactNode;
  statut: string;
  pdfHref: string;
  pdfLabel: string;
  /** Status actions (buttons / links), shown under the title. */
  children?: React.ReactNode;
}) {
  return (
    <FadeIn>
      <Breadcrumbs lastLabel={numero} />
      <div className="card relative overflow-hidden p-5 sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -end-16 -top-20 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="bg-brand-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg shadow-brand-500/30">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{numero}</h1>
                <StatutBadge statut={statut} />
              </div>
              <div className="mt-1 text-sm text-slate-500">{subtitle}</div>
            </div>
          </div>
          <a href={pdfHref} target="_blank" className="btn-secondary h-10 self-start">
            <FileDown className="h-4 w-4" aria-hidden="true" />
            {pdfLabel}
          </a>
        </div>
        {children && <div className="relative mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">{children}</div>}
      </div>
    </FadeIn>
  );
}

/** Small labelled value with an icon, for dates and similar document facts. */
export function InfoTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="card flex items-center gap-3.5 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="truncate text-sm font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
