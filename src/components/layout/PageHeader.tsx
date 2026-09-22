import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

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
    <div className="mb-3">
      <Breadcrumbs lastLabel={breadcrumbLabel} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
