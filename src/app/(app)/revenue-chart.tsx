"use client";

import { useState } from "react";

type Point = { month: string; ht: string };

const W = 640;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 64 };

const fmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const short = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

const monthName = (ym: string, style: "short" | "long") => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", { month: style, year: style === "long" ? "numeric" : undefined, timeZone: "UTC" });
};

/** Plus petit pas « rond » (1, 2, 5 × 10^n) donnant au plus 4 graduations au-dessus de `max`. */
function niceScale(max: number) {
  if (max <= 0) return { top: 1, step: 0.25 };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  return { top: Math.ceil(max / step) * step, step };
}

/** Chiffre d'affaires HT des 12 derniers mois : une série, barres fines ancrées sur la base, tableau équivalent en dessous. */
export function RevenueChart({ data }: { data: Point[] }) {
  const [active, setActive] = useState<number | null>(null);
  const values = data.map((d) => Number(d.ht));
  const { top, step } = niceScale(Math.max(...values, 0));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / data.length;
  const barW = Math.min(20, band * 0.5);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const tip = active === null ? null : { i: active, x: PAD.left + band * active + band / 2 };

  return (
    <figure className="space-y-2">
      <div className="relative overflow-x-auto"><div className="relative min-w-[520px]">
        <svg
          viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
          aria-label="Chiffre d'affaires hors taxes par mois sur les 12 derniers mois"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted)">{short.format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const v = values[i]!;
            const h = Math.max(v > 0 ? 2 : 0, plotH - (y(v) - PAD.top));
            const cx = PAD.left + band * i + band / 2;
            const r = Math.min(4, barW / 2, h);
            const x0 = cx - barW / 2;
            const yTop = PAD.top + plotH - h;
            const yBase = PAD.top + plotH;
            return (
              <g key={d.month}>
                {/* zone de survol plus large que la barre */}
                <rect
                  x={PAD.left + band * i} y={PAD.top} width={band} height={plotH + PAD.bottom} fill="transparent"
                  tabIndex={0} role="img" aria-label={`${monthName(d.month, "long")} : ${fmt.format(v)} DT HT`}
                  onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                />
                {h > 0 && (
                  <path
                    pointerEvents="none" fill="var(--chart-1)" opacity={active === null || active === i ? 1 : 0.55}
                    d={`M${x0},${yBase} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${yBase} Z`}
                  />
                )}
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)" pointerEvents="none">{monthName(d.month, "short").replace(".", "")}</text>
              </g>
            );
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--border)" strokeWidth={1} />
        </svg>
        {tip && (
          <div
            role="status"
            className="card absolute text-xs px-2 py-1 pointer-events-none whitespace-nowrap shadow"
            style={{ left: `${(tip.x / W) * 100}%`, top: 0, transform: "translate(-50%, -100%)" }}
          >
            <span style={{ color: "var(--muted)" }}>{monthName(data[tip.i]!.month, "long")}</span>{" "}
            <strong className="tabular-nums">{fmt.format(values[tip.i]!)} DT</strong>
          </div>
        )}
      </div></div>
      <figcaption className="text-xs" style={{ color: "var(--muted)" }}>Chiffre d&apos;affaires HT facturé par mois, en dinars (avoirs déduits).</figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer" style={{ color: "var(--muted)" }}>Voir le tableau</summary>
        <table className="w-full mt-2">
          <thead><tr className="text-left" style={{ color: "var(--muted)" }}><th className="py-1">Mois</th><th className="py-1 text-right">CA HT (DT)</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1">{monthName(d.month, "long")}</td>
                <td className="py-1 text-right tabular-nums">{fmt.format(Number(d.ht))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
