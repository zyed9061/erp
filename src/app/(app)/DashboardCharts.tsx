import { formatMontant } from "@/lib/format";
import type { Locale } from "@/i18n/config";

export function RevenueChart({
  data,
  title,
  locale,
}: {
  data: { label: string; total: number }[];
  title: string;
  locale: Locale;
}) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const width = 560;
  const height = 200;
  const barGap = 16;
  const barWidth = (width - barGap * (data.length - 1)) / data.length;

  return (
    <svg viewBox={`0 0 ${width} ${height + 24}`} className="w-full" role="img" aria-label={title}>
      {data.map((d, i) => {
        const barHeight = (d.total / max) * height;
        const x = i * (barWidth + barGap);
        const y = height - barHeight;
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={4}
              className="fill-brand-600"
            >
              <title>{`${d.label}: ${formatMontant(d.total, "TND", locale)}`}</title>
            </rect>
            <text
              x={x + barWidth / 2}
              y={height + 16}
              textAnchor="middle"
              className="fill-neutral-500 text-[10px]"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const STATUS_COLORS: Record<string, string> = {
  BROUILLON: "#a3a3a3",
  ENVOYEE: "#3b82f6",
  PARTIELLEMENT_PAYEE: "#f59e0b",
  PAYEE: "#22c55e",
  EN_RETARD: "#ef4444",
  ANNULEE: "#525252",
};

export function StatusDistributionChart({
  data,
}: {
  data: { label: string; statut: string; count: number }[];
}) {
  const total = Math.max(1, data.reduce((sum, d) => sum + d.count, 0));

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.statut} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-xs text-neutral-600">{d.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(d.count / total) * 100}%`,
                backgroundColor: STATUS_COLORS[d.statut] ?? "#a3a3a3",
              }}
              title={`${d.label}: ${d.count}`}
            />
          </div>
          <span className="w-6 shrink-0 text-end text-xs font-medium text-neutral-700">{d.count}</span>
        </div>
      ))}
    </div>
  );
}
