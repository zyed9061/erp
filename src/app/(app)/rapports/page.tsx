import Link from "next/link";
import { db } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { todayTunis } from "@/lib/dates";
import { formatAmount, formatPercent, formatTnd } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments-labels";
import {
  AGE_BUCKETS, AGE_LABELS, agedReceivables, parsePeriod, paymentsReport, revenueReport, vatReport, withholdingReport,
} from "@/lib/reports";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "ca", label: "Chiffre d'affaires", export: "ca-mensuel" },
  { key: "balance", label: "Balance âgée", export: "balance-agee" },
  { key: "tva", label: "TVA, FODEC, timbre", export: "tva" },
  { key: "retenues", label: "Retenues à la source", export: "retenues" },
  { key: "encaissements", label: "Encaissements", export: "encaissements" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" })} ${y}`;
};

const th = "p-3 font-medium";
const num = "p-3 text-right tabular-nums whitespace-nowrap";
const rowStyle = { borderColor: "var(--border)" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string; asOf?: string }>;
}) {
  await requirePermission("reports:read");
  const sp = await searchParams;
  const tab: TabKey = TABS.find((t) => t.key === sp.tab)?.key ?? "ca";
  const period = parsePeriod(sp.from, sp.to);
  const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : todayTunis();
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(tab === "balance" ? { asOf } : period), ...extra }).toString();

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Rapports" />

      <nav className="flex gap-2 flex-wrap" aria-label="Rapports">
        {TABS.map((t) => (
          <Link
            key={t.key} href={`/rapports?${new URLSearchParams({ tab: t.key, from: period.from, to: period.to, asOf })}`}
            className={t.key === tab ? "btn" : "btn btn-ghost"} aria-current={t.key === tab ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <form className="card p-4 flex flex-wrap gap-3 items-end">
        <input type="hidden" name="tab" value={tab} />
        {tab === "balance" ? (
          <label className="block space-y-1"><span className="text-sm">Situation au</span>
            <input className="input" type="date" name="asOf" defaultValue={asOf} /></label>
        ) : (
          <>
            <label className="block space-y-1"><span className="text-sm">Du</span>
              <input className="input" type="date" name="from" defaultValue={period.from} /></label>
            <label className="block space-y-1"><span className="text-sm">Au</span>
              <input className="input" type="date" name="to" defaultValue={period.to} /></label>
          </>
        )}
        <button className="btn">Afficher</button>
        <span className="flex-1" />
        <a className="btn btn-ghost" href={`/rapports/export/${TABS.find((t) => t.key === tab)!.export}?${qs({})}`}>Exporter en CSV</a>
        {tab === "ca" && (
          <a className="btn btn-ghost" href={`/rapports/export/ca-clients?${qs({})}`}>CSV par client</a>
        )}
      </form>

      {tab === "ca" && <Revenue period={period} />}
      {tab === "balance" && <Aged asOf={asOf} />}
      {tab === "tva" && <Vat period={period} />}
      {tab === "retenues" && <Withholding period={period} />}
      {tab === "encaissements" && <Payments period={period} />}
    </div>
  );
}

function Table({ head, children, caption }: { head: { label: string; right?: boolean }[]; children: React.ReactNode; caption?: string }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        {caption && <caption className="text-left p-3 font-medium">{caption}</caption>}
        <thead>
          <tr className="text-left" style={{ color: "var(--muted)" }}>
            {head.map((h) => <th key={h.label} className={`${th} ${h.right ? "text-right" : ""}`}>{h.label}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const Empty = ({ cols }: { cols: number }) => (
  <tr><td className="p-3" colSpan={cols} style={{ color: "var(--muted)" }}>Aucune donnée sur cette période.</td></tr>
);

type RevenueValues = { count: number; ht: string; fodec: string; tva: string; ttc: string };

function RevenueRow({ label, x, bold }: { label: string; x: RevenueValues; bold?: boolean }) {
  return (
    <tr className={`border-t ${bold ? "font-semibold" : ""}`} style={rowStyle}>
      <td className="p-3">{label}</td><td className={num}>{x.count}</td><td className={num}>{formatAmount(x.ht)}</td>
      <td className={num}>{formatAmount(x.fodec)}</td><td className={num}>{formatAmount(x.tva)}</td><td className={num}>{formatAmount(x.ttc)}</td>
    </tr>
  );
}

async function Revenue({ period }: { period: { from: string; to: string } }) {
  const r = await revenueReport(db, period);
  const head = [{ label: "" }, { label: "Documents", right: true }, { label: "Total HT", right: true }, { label: "FODEC", right: true }, { label: "TVA", right: true }, { label: "Total TTC", right: true }];
  return (
    <>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Documents validés (factures, acomptes) ; les avoirs sont déduits. Les brouillons sont exclus. Montants en dinars (DT).
      </p>
      <Table head={[{ ...head[0]!, label: "Mois" }, ...head.slice(1)]} caption="Par mois">
        {r.byMonth.map((m) => <RevenueRow key={m.key} label={monthLabel(m.key)} x={m} />)}
        {r.byMonth.length === 0 ? <Empty cols={6} /> : <RevenueRow label="Total" x={r.totals} bold />}
      </Table>
      <Table head={[{ ...head[0]!, label: "Client" }, ...head.slice(1)]} caption="Par client">
        {r.byCustomer.map((c) => <RevenueRow key={c.key} label={c.label} x={c} />)}
        {r.byCustomer.length === 0 && <Empty cols={6} />}
      </Table>
    </>
  );
}

async function Aged({ asOf }: { asOf: string }) {
  const r = await agedReceivables(db, asOf);
  const head = [{ label: "Client" }, ...AGE_BUCKETS.map((b) => ({ label: AGE_LABELS[b], right: true })), { label: "Total", right: true }];
  return (
    <>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Reste à payer des factures validées (net à payer après retenue, avoirs et paiements déduits), classé selon le retard sur l&apos;échéance au {asOf}.
      </p>
      <Table head={head}>
        {r.rows.map((x) => (
          <tr key={x.customerId} className="border-t" style={rowStyle}>
            <td className="p-3">{x.customerName}</td>
            {AGE_BUCKETS.map((b) => <td key={b} className={num}>{formatAmount(x[b])}</td>)}
            <td className={`${num} font-medium`}>{formatAmount(x.total)}</td>
          </tr>
        ))}
        {r.rows.length === 0 ? <Empty cols={7} /> : (
          <tr className="border-t font-semibold" style={rowStyle}>
            <td className="p-3">Total</td>
            {AGE_BUCKETS.map((b) => <td key={b} className={num}>{formatAmount(r.totals[b])}</td>)}
            <td className={num}>{formatAmount(r.totals.total)}</td>
          </tr>
        )}
      </Table>
    </>
  );
}

async function Vat({ period }: { period: { from: string; to: string } }) {
  const r = await vatReport(db, period);
  return (
    <>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Base facturation : documents validés sur la période, avoirs déduits. Ces chiffres préparent la déclaration, ils ne la remplacent pas.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="TVA collectée" value={formatTnd(r.totals.tva)} />
        <Kpi label="FODEC" value={formatTnd(r.totals.fodec)} />
        <Kpi label="Timbre fiscal" value={formatTnd(r.totals.stampDuty)} />
      </div>
      <Table head={[{ label: "Type" }, { label: "Taux", right: true }, { label: "Base", right: true }, { label: "Montant", right: true }]} caption="Par taux">
        {r.byRate.map((x) => (
          <tr key={`${x.kind}-${x.rate}`} className="border-t" style={rowStyle}>
            <td className="p-3">{x.kind === "tva" ? "TVA" : "FODEC"}</td>
            <td className={num}>{formatPercent(x.rate)}</td><td className={num}>{formatAmount(x.base)}</td><td className={num}>{formatAmount(x.amount)}</td>
          </tr>
        ))}
        {r.byRate.length === 0 && <Empty cols={4} />}
      </Table>
      <Table head={[{ label: "Mois" }, { label: "TVA", right: true }, { label: "FODEC", right: true }]} caption="Par mois">
        {r.byMonth.map((m) => (
          <tr key={m.month} className="border-t" style={rowStyle}>
            <td className="p-3">{monthLabel(m.month)}</td><td className={num}>{formatAmount(m.tva)}</td><td className={num}>{formatAmount(m.fodec)}</td>
          </tr>
        ))}
        {r.byMonth.length === 0 && <Empty cols={3} />}
      </Table>
    </>
  );
}

async function Withholding({ period }: { period: { from: string; to: string } }) {
  const r = await withholdingReport(db, period);
  return (
    <>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Retenues à la source subies sur les factures validées, et certificats de retenue déjà reçus. « Reste à justifier » = retenue sans certificat.
      </p>
      <Table head={[{ label: "Facture" }, { label: "Date" }, { label: "Client" }, { label: "Taux", right: true }, { label: "Retenue", right: true }, { label: "Certificats", right: true }, { label: "Reste à justifier", right: true }]}>
        {r.rows.map((x) => (
          <tr key={x.invoiceId} className="border-t" style={rowStyle}>
            <td className="p-3 font-mono"><Link className="underline" href={`/factures/${x.invoiceId}`}>{x.number}</Link></td>
            <td className="p-3 whitespace-nowrap">{x.issueDate}</td><td className="p-3">{x.customerName}</td>
            <td className={num}>{formatPercent(x.rate)}</td><td className={num}>{formatAmount(x.amount)}</td>
            <td className={num}>{formatAmount(x.certified)}</td><td className={num}>{formatAmount(x.missing)}</td>
          </tr>
        ))}
        {r.rows.length === 0 ? <Empty cols={7} /> : (
          <tr className="border-t font-semibold" style={rowStyle}>
            <td className="p-3" colSpan={4}>Total</td>
            <td className={num}>{formatAmount(r.totals.amount)}</td><td className={num}>{formatAmount(r.totals.certified)}</td><td className={num}>{formatAmount(r.totals.missing)}</td>
          </tr>
        )}
      </Table>
    </>
  );
}

async function Payments({ period }: { period: { from: string; to: string } }) {
  const r = await paymentsReport(db, period);
  return (
    <>
      <p className="text-sm" style={{ color: "var(--muted)" }}>Paiements encaissés sur la période (paiements annulés exclus).</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi label="Total encaissé" value={formatTnd(r.totals.amount)} />
        <Kpi label="Nombre de paiements" value={String(r.totals.count)} />
      </div>
      <Table head={[{ label: "Mois" }, { label: "Paiements", right: true }, { label: "Montant", right: true }]} caption="Par mois">
        {r.byMonth.map((m) => (
          <tr key={m.key} className="border-t" style={rowStyle}>
            <td className="p-3">{monthLabel(m.key)}</td><td className={num}>{m.count}</td><td className={num}>{formatAmount(m.amount)}</td>
          </tr>
        ))}
        {r.byMonth.length === 0 && <Empty cols={3} />}
      </Table>
      <Table head={[{ label: "Mode de paiement" }, { label: "Paiements", right: true }, { label: "Montant", right: true }]} caption="Par mode">
        {r.byMethod.map((m) => (
          <tr key={m.method} className="border-t" style={rowStyle}>
            <td className="p-3">{PAYMENT_METHOD_LABELS[m.method]}</td><td className={num}>{m.count}</td><td className={num}>{formatAmount(m.amount)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
