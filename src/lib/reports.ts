import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Db } from "@/db/types";
import {
  customers, invoiceBalances, invoiceTaxLines, invoices, payments, PAYMENT_METHODS, type PaymentMethod,
} from "@/db/schema";
import { todayTunis } from "./dates";
import { fromMilli, toMilli } from "./money";
import { listStock } from "./stock";

// ---------------------------------------------------------------------------
// Période
// ---------------------------------------------------------------------------

export type Period = { from: string; to: string };

const isDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/** Période demandée si elle est valide, sinon l'année en cours. */
export function parsePeriod(from?: string, to?: string, today: string = todayTunis()): Period {
  const y = today.slice(0, 4);
  if (isDate(from) && isDate(to) && from <= to) return { from, to };
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

const validatedIn = ({ from, to }: Period) =>
  and(eq(invoices.status, "validated"), gte(invoices.issueDate, from), lte(invoices.issueDate, to));

/** Un avoir vient en déduction : ses montants comptent en négatif dans tous les rapports. */
const signed = (col: PgColumn) => sql`(case when ${invoices.kind} = 'credit_note' then -1 else 1 end) * ${col}`;
const total = (col: PgColumn) => sql<string>`coalesce(sum(${signed(col)}), 0)::text`;
const monthOf = sql<string>`to_char(${invoices.issueDate}, 'YYYY-MM')`;

const norm = (v: string | null | undefined) => fromMilli(toMilli(v ?? "0"));

// ---------------------------------------------------------------------------
// Chiffre d'affaires
// ---------------------------------------------------------------------------

export type RevenueRow = { key: string; label: string; count: number; ht: string; fodec: string; tva: string; ttc: string };

/**
 * Chiffre d'affaires facturé (documents validés, avoirs déduits). Les factures d'acompte comptent à leur émission
 * et la facture finale déduit les acomptes : rien n'est compté deux fois.
 */
export async function revenueReport(db: Db, period: Period) {
  const [byMonth, byCustomer] = await Promise.all([
    db
      .select({
        key: monthOf, count: sql<number>`count(*)::int`,
        ht: total(invoices.totalHt), fodec: total(invoices.totalFodec), tva: total(invoices.totalTva), ttc: total(invoices.totalTtc),
      })
      .from(invoices).where(validatedIn(period)).groupBy(monthOf).orderBy(asc(monthOf)),
    db
      .select({
        key: customers.id, label: customers.name, count: sql<number>`count(*)::int`,
        ht: total(invoices.totalHt), fodec: total(invoices.totalFodec), tva: total(invoices.totalTva), ttc: total(invoices.totalTtc),
      })
      .from(invoices).innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(validatedIn(period)).groupBy(customers.id, customers.name)
      .orderBy(desc(sql`sum(${signed(invoices.totalHt)})`)),
  ]);
  const clean = (r: { key: string; label?: string; count: number; ht: string; fodec: string; tva: string; ttc: string }): RevenueRow => ({
    key: r.key, label: r.label ?? r.key, count: r.count, ht: norm(r.ht), fodec: norm(r.fodec), tva: norm(r.tva), ttc: norm(r.ttc),
  });
  const months = byMonth.map(clean);
  const customersRows = byCustomer.map(clean);
  const sum = (k: "ht" | "fodec" | "tva" | "ttc") => fromMilli(months.reduce((s, r) => s + toMilli(r[k]), 0n));
  return {
    period, byMonth: months, byCustomer: customersRows,
    totals: { count: months.reduce((s, r) => s + r.count, 0), ht: sum("ht"), fodec: sum("fodec"), tva: sum("tva"), ttc: sum("ttc") },
  };
}

// ---------------------------------------------------------------------------
// Balance âgée des créances
// ---------------------------------------------------------------------------

export const AGE_BUCKETS = ["notDue", "d1_30", "d31_60", "d61_90", "over90"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];
export const AGE_LABELS: Record<AgeBucket, string> = {
  notDue: "Non échu", d1_30: "1 à 30 j", d31_60: "31 à 60 j", d61_90: "61 à 90 j", over90: "Plus de 90 j",
};

export function bucketOf(dueDate: string | null, asOf: string): AgeBucket {
  if (!dueDate) return "notDue";
  const late = Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000);
  return late <= 0 ? "notDue" : late <= 30 ? "d1_30" : late <= 60 ? "d31_60" : late <= 90 ? "d61_90" : "over90";
}

export type AgedRow = { customerId: string; customerName: string; total: string } & Record<AgeBucket, string>;

/** Créances ouvertes (reste dû > 0) réparties par ancienneté de retard, par client. */
export async function agedReceivables(db: Db, asOf: string = todayTunis()) {
  const rows = await db
    .select({
      customerId: customers.id, customerName: customers.name, number: invoices.number, dueDate: invoices.dueDate,
      net: invoiceBalances.netToPay, credited: invoiceBalances.credited, paid: invoiceBalances.paid,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .innerJoin(invoiceBalances, eq(invoiceBalances.invoiceId, invoices.id))
    .where(sql`(${invoiceBalances.netToPay} - ${invoiceBalances.credited} - ${invoiceBalances.paid}) > 0`);

  const zero = () => Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0n])) as Record<AgeBucket, bigint>;
  const byCustomer = new Map<string, { name: string; b: Record<AgeBucket, bigint> }>();
  const grand = zero();
  for (const r of rows) {
    const due = toMilli(r.net ?? "0") - toMilli(r.credited ?? "0") - toMilli(r.paid ?? "0");
    const bucket = bucketOf(r.dueDate, asOf);
    const entry = byCustomer.get(r.customerId) ?? { name: r.customerName, b: zero() };
    entry.b[bucket] += due;
    grand[bucket] += due;
    byCustomer.set(r.customerId, entry);
  }
  const out = (b: Record<AgeBucket, bigint>) => ({
    ...(Object.fromEntries(AGE_BUCKETS.map((k) => [k, fromMilli(b[k])])) as Record<AgeBucket, string>),
    total: fromMilli(AGE_BUCKETS.reduce((s, k) => s + b[k], 0n)),
  });
  const list: AgedRow[] = [...byCustomer].map(([customerId, e]) => ({ customerId, customerName: e.name, ...out(e.b) }))
    .sort((a, b) => Number(toMilli(b.total) - toMilli(a.total)));
  return { asOf, rows: list, totals: out(grand) };
}

// ---------------------------------------------------------------------------
// TVA, FODEC, timbre
// ---------------------------------------------------------------------------

/** Déclaration sur la base de la facturation (documents validés, avoirs déduits), par taux et par mois. */
export async function vatReport(db: Db, period: Period) {
  const signedTax = (col: PgColumn) => sql<string>`coalesce(sum((case when ${invoices.kind} = 'credit_note' then -1 else 1 end) * ${col}), 0)::text`;
  const [byRate, byMonth, [stamp]] = await Promise.all([
    db
      .select({ kind: invoiceTaxLines.kind, rate: invoiceTaxLines.rate, base: signedTax(invoiceTaxLines.base), amount: signedTax(invoiceTaxLines.amount) })
      .from(invoiceTaxLines).innerJoin(invoices, eq(invoices.id, invoiceTaxLines.invoiceId))
      .where(validatedIn(period)).groupBy(invoiceTaxLines.kind, invoiceTaxLines.rate)
      .orderBy(asc(invoiceTaxLines.kind), asc(invoiceTaxLines.rate)),
    db
      .select({
        month: monthOf,
        tva: sql<string>`coalesce(sum(case when ${invoiceTaxLines.kind} = 'tva' then (case when ${invoices.kind} = 'credit_note' then -1 else 1 end) * ${invoiceTaxLines.amount} else 0 end), 0)::text`,
        fodec: sql<string>`coalesce(sum(case when ${invoiceTaxLines.kind} = 'fodec' then (case when ${invoices.kind} = 'credit_note' then -1 else 1 end) * ${invoiceTaxLines.amount} else 0 end), 0)::text`,
      })
      .from(invoiceTaxLines).innerJoin(invoices, eq(invoices.id, invoiceTaxLines.invoiceId))
      .where(validatedIn(period)).groupBy(monthOf).orderBy(asc(monthOf)),
    db
      .select({ total: sql<string>`coalesce(sum(${invoices.stampDuty}), 0)::text` })
      .from(invoices).where(and(validatedIn(period), sql`${invoices.kind} <> 'credit_note'`)),
  ]);
  const rates = byRate.map((r) => ({ kind: r.kind, rate: r.rate, base: norm(r.base), amount: norm(r.amount) }));
  const tva = rates.filter((r) => r.kind === "tva").reduce((s, r) => s + toMilli(r.amount), 0n);
  const fodec = rates.filter((r) => r.kind === "fodec").reduce((s, r) => s + toMilli(r.amount), 0n);
  return {
    period, byRate: rates,
    byMonth: byMonth.map((m) => ({ month: m.month, tva: norm(m.tva), fodec: norm(m.fodec) })),
    totals: { tva: fromMilli(tva), fodec: fromMilli(fodec), stampDuty: norm(stamp?.total) },
  };
}

// ---------------------------------------------------------------------------
// Retenues à la source
// ---------------------------------------------------------------------------

export type WithholdingRow = {
  invoiceId: string; number: string; issueDate: string; customerName: string; rate: string;
  amount: string; certified: string; missing: string;
};

/** Retenues subies (déduites du net à payer) et état des certificats reçus. */
export async function withholdingReport(db: Db, period: Period) {
  const rows = await db
    .select({
      inv: invoices, customerName: customers.name,
      certified: sql<string>`coalesce((select sum(c.amount) from withholding_certificates c where c.invoice_id = invoices.id), 0)::text`,
    })
    .from(invoices).innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(validatedIn(period), sql`${invoices.kind} <> 'credit_note'`, sql`${invoices.withholdingAmount} > 0`))
    .orderBy(asc(invoices.issueDate), asc(invoices.number));
  const list: WithholdingRow[] = rows.map((r) => ({
    invoiceId: r.inv.id, number: r.inv.number ?? "", issueDate: r.inv.issueDate, customerName: r.customerName,
    rate: r.inv.withholdingRate ?? "0.000", amount: r.inv.withholdingAmount, certified: norm(r.certified),
    missing: fromMilli(toMilli(r.inv.withholdingAmount) - toMilli(r.certified)),
  }));
  const sum = (k: "amount" | "certified" | "missing") => fromMilli(list.reduce((s, r) => s + toMilli(r[k]), 0n));
  return { period, rows: list, totals: { amount: sum("amount"), certified: sum("certified"), missing: sum("missing") } };
}

// ---------------------------------------------------------------------------
// Encaissements
// ---------------------------------------------------------------------------

export async function paymentsReport(db: Db, period: Period) {
  const inPeriod = and(sql`${payments.voidedAt} IS NULL`, gte(payments.paymentDate, period.from), lte(payments.paymentDate, period.to));
  const month = sql<string>`to_char(${payments.paymentDate}, 'YYYY-MM')`;
  const [byMonth, byMethod] = await Promise.all([
    db.select({ key: month, count: sql<number>`count(*)::int`, amount: sql<string>`coalesce(sum(${payments.amount}), 0)::text` })
      .from(payments).where(inPeriod).groupBy(month).orderBy(asc(month)),
    db.select({ key: payments.method, count: sql<number>`count(*)::int`, amount: sql<string>`coalesce(sum(${payments.amount}), 0)::text` })
      .from(payments).where(inPeriod).groupBy(payments.method),
  ]);
  const months = byMonth.map((r) => ({ key: r.key, count: r.count, amount: norm(r.amount) }));
  const methods = PAYMENT_METHODS.map((m) => {
    const r = byMethod.find((x) => x.key === m);
    return { method: m as PaymentMethod, count: r?.count ?? 0, amount: norm(r?.amount) };
  });
  return {
    period, byMonth: months, byMethod: methods,
    totals: { count: months.reduce((s, r) => s + r.count, 0), amount: fromMilli(months.reduce((s, r) => s + toMilli(r.amount), 0n)) },
  };
}

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

export type DashboardStats = {
  month: string;
  revenueMonthHt: string; revenueYearHt: string; collectedMonth: string;
  receivablesTotal: string; overdueTotal: string; overdueCount: number;
  draftInvoices: number; quotesAwaiting: number; deliveriesToInvoice: number; lowStock: number; activeProjects: number;
  series: { month: string; ht: string }[];
};

/** Les 12 derniers mois se terminant au mois de `today`, du plus ancien au plus récent. */
export function lastMonths(today: string, n = 12): string[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export async function dashboardStats(db: Db, today: string = todayTunis()): Promise<DashboardStats> {
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const months = lastMonths(today);
  const seriesFrom = `${months[0]}-01`;
  const count = async (query: PromiseLike<{ n: number }[]>) => (await query)[0]?.n ?? 0;

  const [series, yearRev, collected, open, overdue, drafts, quotes, deliveries, low, projects] = await Promise.all([
    revenueReport(db, { from: seriesFrom, to: today }),
    revenueReport(db, { from: yearStart, to: today }),
    paymentsReport(db, { from: monthStart, to: today }),
    db.select({ total: sql<string>`coalesce(sum(${invoiceBalances.netToPay} - ${invoiceBalances.credited} - ${invoiceBalances.paid}), 0)::text` })
      .from(invoiceBalances).where(sql`(${invoiceBalances.netToPay} - ${invoiceBalances.credited} - ${invoiceBalances.paid}) > 0`),
    db.select({
      total: sql<string>`coalesce(sum(${invoiceBalances.netToPay} - ${invoiceBalances.credited} - ${invoiceBalances.paid}), 0)::text`,
      n: sql<number>`count(*)::int`,
    }).from(invoiceBalances).innerJoin(invoices, eq(invoices.id, invoiceBalances.invoiceId))
      .where(and(sql`(${invoiceBalances.netToPay} - ${invoiceBalances.credited} - ${invoiceBalances.paid}) > 0`, sql`${invoices.dueDate} < ${today}`)),
    count(db.select({ n: sql<number>`count(*)::int` }).from(invoices).where(eq(invoices.status, "draft"))),
    count(db.execute(sql`select count(*)::int as n from quotes where status = 'sent'`).then((r) => rowsOf<{ n: number }>(r))),
    count(db.execute(sql`select count(*)::int as n from delivery_notes where status = 'validated' and invoice_id is null`).then((r) => rowsOf<{ n: number }>(r))),
    listStock(db, { lowOnly: true, pageSize: 1 }).then((r) => r.total),
    count(db.execute(sql`select count(*)::int as n from projects where status = 'active'`).then((r) => rowsOf<{ n: number }>(r))),
  ]);

  const byMonth = new Map(series.byMonth.map((r) => [r.key, r.ht]));
  return {
    month,
    revenueMonthHt: byMonth.get(month) ?? "0.000",
    revenueYearHt: yearRev.totals.ht,
    collectedMonth: collected.totals.amount,
    receivablesTotal: norm(open[0]?.total),
    overdueTotal: norm(overdue[0]?.total),
    overdueCount: overdue[0]?.n ?? 0,
    draftInvoices: drafts, quotesAwaiting: quotes, deliveriesToInvoice: deliveries, lowStock: low, activeProjects: projects,
    series: months.map((m) => ({ month: m, ht: byMonth.get(m) ?? "0.000" })),
  };
}

/** `db.execute` renvoie `{ rows }` (PGlite) ou un tableau (node-postgres) selon le pilote. */
function rowsOf<T>(result: unknown): T[] {
  const r = result as { rows?: T[] } | T[];
  return Array.isArray(r) ? r : (r.rows ?? []);
}
