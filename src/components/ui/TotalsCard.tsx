export interface TotalsRow {
  label: string;
  value: string;
  /** "total" = grand total (gradient band), "strong" = bold row, default = regular row. */
  variant?: "total" | "strong";
}

/** Right-aligned summary of document totals (subtotal, VAT, total...). No hooks: usable on server pages. */
export function TotalsCard({ rows, className = "" }: { rows: TotalsRow[]; className?: string }) {
  return (
    <div className={`card ms-auto w-full overflow-hidden sm:max-w-sm ${className}`}>
      <dl className="divide-y divide-slate-100 text-sm">
        {rows.map((row) =>
          row.variant === "total" ? (
            <div
              key={row.label}
              className="bg-brand-gradient flex items-center justify-between gap-4 px-5 py-4 text-white"
            >
              <dt className="font-medium text-white/85">{row.label}</dt>
              <dd className="text-lg font-semibold tracking-tight tabular-nums">{row.value}</dd>
            </div>
          ) : (
            <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-2.5">
              <dt className={row.variant === "strong" ? "font-medium text-slate-900" : "text-slate-500"}>{row.label}</dt>
              <dd
                className={`tabular-nums ${row.variant === "strong" ? "font-semibold text-slate-900" : "text-slate-700"}`}
              >
                {row.value}
              </dd>
            </div>
          ),
        )}
      </dl>
    </div>
  );
}
