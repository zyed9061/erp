import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { FadeIn } from "@/components/motion/Motion";

export function PageHeader({
  title,
  description,
  breadcrumbLabel,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumbLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <FadeIn className="mb-6">
      <Breadcrumbs lastLabel={breadcrumbLabel} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </FadeIn>
  );
}
