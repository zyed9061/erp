import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeFactureDisplayStatut } from "@/lib/factureStatus";
import { showsRisk } from "@/lib/ml";

// Read-only tools the assistant can call. The model never writes SQL: it can only pick one
// of these functions, and every number in its answer comes from what they return.
// Amounts are in TND, dates are YYYY-MM-DD.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const FACTURE_STATUSES = ["BROUILLON", "ENVOYEE", "PARTIELLEMENT_PAYEE", "PAYEE", "EN_RETARD", "ANNULEE"] as const;
const DEVIS_STATUSES = ["BROUILLON", "ENVOYE", "ACCEPTE", "REFUSE", "EXPIRE", "CONVERTI"] as const;
const AVOIR_STATUSES = ["BROUILLON", "EMIS", "APPLIQUE", "REMBOURSE", "ANNULE"] as const;
const PAYMENT_METHODS = ["VIREMENT", "CHEQUE", "ESPECES", "CARTE", "AUTRE"] as const;
const SEGMENTS = ["KEY_ACCOUNT", "RELIABLE", "OCCASIONAL_LATE", "SLOW_PAYER", "INACTIVE", "NEW"] as const;

const limit = (max: number, fallback: number) => z.number().int().min(1).max(max).default(fallback);
const clientFilter = z.string().min(1).optional().describe("Part of the client name (case-insensitive)");
const range = {
  from: isoDate.optional().describe("Issue date from (inclusive), YYYY-MM-DD"),
  to: isoDate.optional().describe("Issue date to (inclusive), YYYY-MM-DD"),
};

// ---------------------------------------------------------------------------
// Helpers

const round = (n: number) => Math.round(n * 1000) / 1000;
const pad = (n: number) => String(n).padStart(2, "0");
const day = (d: Date | null | undefined) =>
  d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null;

function parseDay(value: string, offsetDays = 0) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d + offsetDays);
}

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return { ...(from && { gte: parseDay(from) }), ...(to && { lt: parseDay(to, 1) }) };
}

const nameContains = (client?: string) =>
  client ? { client: { nom: { contains: client, mode: "insensitive" as const } } } : {};

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

/** Invoices with numbers converted and the display status (overdue is derived, not stored). */
async function loadFactures(where: object = {}) {
  const rows = await prisma.facture.findMany({
    where,
    include: {
      client: { select: { nom: true } },
      mlScore: { select: { riskLevel: true, lateProbability: true, expectedPaymentDate: true, isAnomaly: true } },
    },
  });
  return rows.map((f) => {
    const totalTTC = Number(f.totalTTC);
    const montantPaye = Number(f.montantPaye);
    return {
      ...f,
      totalHT: Number(f.sousTotalHT),
      totalTTC,
      montantPaye,
      resteAPayer: Math.max(0, totalTTC - montantPaye),
      status: computeFactureDisplayStatut({ statut: f.statut, dateEcheance: f.dateEcheance, totalTTC, montantPaye }),
    };
  });
}
type LoadedFacture = Awaited<ReturnType<typeof loadFactures>>[number];

function invoiceRow(f: LoadedFacture) {
  const risk = f.mlScore?.riskLevel && showsRisk(f.statut, f.resteAPayer) ? f.mlScore : null;
  return {
    numero: f.numero,
    client: f.client.nom,
    issueDate: day(f.dateEmission),
    dueDate: day(f.dateEcheance),
    status: f.status,
    totalTTC: round(f.totalTTC),
    paid: round(f.montantPaye),
    amountDue: round(f.resteAPayer),
    ...(risk && {
      lateRisk: risk.riskLevel,
      lateProbabilityPct: Math.round(Number(risk.lateProbability ?? 0) * 100),
      expectedPaymentDate: day(risk.expectedPaymentDate),
    }),
    ...(f.mlScore?.isAnomaly && { flaggedUnusual: true }),
  };
}

// ---------------------------------------------------------------------------
// Tools

const overviewArgs = z.object({});
async function getOverview() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const [factures, clients, activeClients, produits, devis, avoirs, paiements] = await Promise.all([
    loadFactures(),
    prisma.client.count(),
    prisma.client.count({ where: { actif: true } }),
    prisma.produit.groupBy({ by: ["type"], _count: true }),
    prisma.devis.groupBy({ by: ["statut"], _count: true, _sum: { totalTTC: true } }),
    prisma.avoir.groupBy({ by: ["statut"], _count: true, _sum: { totalTTC: true } }),
    prisma.paiement.aggregate({ _count: true, _sum: { montant: true } }),
  ]);
  const billed = factures.filter((f) => f.statut !== "ANNULEE");
  const sum = (list: LoadedFacture[], pick: (f: LoadedFacture) => number) => round(list.reduce((s, f) => s + pick(f), 0));
  return {
    today: day(now),
    clients: { total: clients, active: activeClients },
    products: Object.fromEntries(produits.map((p) => [p.type, p._count])),
    invoices: {
      total: factures.length,
      byStatus: countBy(factures, (f) => f.status),
      totalBilledTTC_excludingCancelled: sum(billed, (f) => f.totalTTC),
      totalPaid: sum(billed, (f) => f.montantPaye),
      amountToCollect: sum(billed, (f) => f.resteAPayer),
      overdueAmount: sum(billed.filter((f) => f.status === "EN_RETARD"), (f) => f.resteAPayer),
      revenueThisMonthTTC: sum(billed.filter((f) => f.dateEmission >= startOfMonth), (f) => f.totalTTC),
      revenueThisYearTTC: sum(billed.filter((f) => f.dateEmission >= startOfYear), (f) => f.totalTTC),
    },
    quotes: {
      total: devis.reduce((s, d) => s + d._count, 0),
      byStatus: Object.fromEntries(devis.map((d) => [d.statut, { count: d._count, totalTTC: round(Number(d._sum.totalTTC ?? 0)) }])),
    },
    creditNotes: {
      total: avoirs.reduce((s, a) => s + a._count, 0),
      byStatus: Object.fromEntries(avoirs.map((a) => [a.statut, { count: a._count, totalTTC: round(Number(a._sum.totalTTC ?? 0)) }])),
    },
    payments: { count: paiements._count, total: round(Number(paiements._sum.montant ?? 0)) },
  };
}

const searchInvoicesArgs = z.object({
  status: z.enum(FACTURE_STATUSES).optional().describe("EN_RETARD = overdue (unpaid after the due date)"),
  client: clientFilter,
  ...range,
  dueFrom: isoDate.optional().describe("Due date from (inclusive)"),
  dueTo: isoDate.optional().describe("Due date to (inclusive)"),
  lateRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).optional().describe("ML late-payment risk of open invoices"),
  unusualOnly: z.boolean().optional().describe("Only invoices flagged as unusual by the anomaly model"),
  sort: z
    .enum(["recent", "oldest", "amount_due", "total", "due_date", "late_risk"])
    .default("recent")
    .describe("late_risk = highest ML late-payment probability first (open invoices with a score)"),
  limit: limit(25, 10).describe("Rows to list; totals always cover every match"),
});
/** ML late-payment probability, or -1 when the invoice has no score that is still meaningful. */
const lateProbability = (f: LoadedFacture) =>
  f.mlScore?.riskLevel && showsRisk(f.statut, f.resteAPayer) ? Number(f.mlScore.lateProbability ?? 0) : -1;

async function searchInvoices(args: z.infer<typeof searchInvoicesArgs>) {
  let list = await loadFactures({
    ...nameContains(args.client),
    ...(dateRange(args.from, args.to) && { dateEmission: dateRange(args.from, args.to) }),
    ...(dateRange(args.dueFrom, args.dueTo) && { dateEcheance: dateRange(args.dueFrom, args.dueTo) }),
    ...(args.unusualOnly && { mlScore: { isAnomaly: true } }),
  });
  if (args.status) list = list.filter((f) => f.status === args.status);
  if (args.lateRisk) {
    list = list.filter((f) => f.mlScore?.riskLevel === args.lateRisk && showsRisk(f.statut, f.resteAPayer));
  }
  if (args.sort === "late_risk") list = list.filter((f) => lateProbability(f) >= 0);
  const sorters: Record<typeof args.sort, (a: LoadedFacture, b: LoadedFacture) => number> = {
    recent: (a, b) => b.dateEmission.getTime() - a.dateEmission.getTime(),
    oldest: (a, b) => a.dateEmission.getTime() - b.dateEmission.getTime(),
    amount_due: (a, b) => b.resteAPayer - a.resteAPayer,
    total: (a, b) => b.totalTTC - a.totalTTC,
    due_date: (a, b) => (a.dateEcheance?.getTime() ?? Infinity) - (b.dateEcheance?.getTime() ?? Infinity),
    late_risk: (a, b) => lateProbability(b) - lateProbability(a),
  };
  list.sort(sorters[args.sort]);
  const notCancelled = list.filter((f) => f.statut !== "ANNULEE");
  const total = (pick: (f: LoadedFacture) => number) => round(notCancelled.reduce((s, f) => s + pick(f), 0));
  return {
    matched: list.length,
    byStatus: countBy(list, (f) => f.status),
    totalsExcludingCancelled: {
      totalHT: total((f) => f.totalHT),
      totalTTC: total((f) => f.totalTTC),
      paid: total((f) => f.montantPaye),
      amountDue: total((f) => f.resteAPayer),
    },
    rows: list.slice(0, args.limit).map(invoiceRow),
  };
}

const getDocumentArgs = z.object({
  numero: z.string().min(3).describe("Document number, e.g. FAC-2026-0412, DEV-2026-0012 or AV-2026-0003"),
});
async function getDocument({ numero }: z.infer<typeof getDocumentArgs>) {
  const match = { numero: { equals: numero.trim(), mode: "insensitive" as const } };
  const lines = { orderBy: { ordre: "asc" as const }, select: { designation: true, quantite: true, prixUnitaireHT: true, tauxTva: true, totalHT: true } };
  const lineRows = (rows: { designation: string; quantite: unknown; prixUnitaireHT: unknown; tauxTva: unknown; totalHT: unknown }[]) =>
    rows.map((l) => ({
      designation: l.designation,
      quantity: Number(l.quantite),
      unitPriceHT: Number(l.prixUnitaireHT),
      vatPct: Number(l.tauxTva),
      totalHT: Number(l.totalHT),
    }));

  const [facture] = await loadFactures(match);
  if (facture) {
    const extra = await prisma.facture.findUniqueOrThrow({
      where: { id: facture.id },
      include: {
        lignes: lines,
        paiements: { orderBy: { datePaiement: "asc" } },
        avoirs: { select: { numero: true, totalTTC: true, statut: true } },
        devisOrigine: { select: { numero: true } },
      },
    });
    return {
      type: "invoice",
      ...invoiceRow(facture),
      totalHT: round(facture.totalHT),
      totalVAT: Number(extra.totalTva),
      stampDuty: Number(extra.timbreFiscal),
      fromQuote: extra.devisOrigine?.numero ?? null,
      lines: lineRows(extra.lignes),
      payments: extra.paiements.map((p) => ({ date: day(p.datePaiement), amount: Number(p.montant), method: p.modePaiement })),
      creditNotes: extra.avoirs.map((a) => ({ numero: a.numero, totalTTC: Number(a.totalTTC), status: a.statut })),
    };
  }

  const devis = await prisma.devis.findFirst({
    where: match,
    include: { client: { select: { nom: true } }, lignes: lines, facture: { select: { numero: true } } },
  });
  if (devis) {
    return {
      type: "quote",
      numero: devis.numero,
      client: devis.client.nom,
      issueDate: day(devis.dateEmission),
      validUntil: day(devis.dateValidite),
      status: devis.statut,
      totalHT: Number(devis.sousTotalHT),
      totalVAT: Number(devis.totalTva),
      totalTTC: Number(devis.totalTTC),
      convertedToInvoice: devis.facture?.numero ?? null,
      lines: lineRows(devis.lignes),
    };
  }

  const avoir = await prisma.avoir.findFirst({
    where: match,
    include: { client: { select: { nom: true } }, lignes: lines, factureOrigine: { select: { numero: true } } },
  });
  if (avoir) {
    return {
      type: "credit_note",
      numero: avoir.numero,
      client: avoir.client.nom,
      issueDate: day(avoir.dateEmission),
      status: avoir.statut,
      reason: avoir.motif,
      totalTTC: Number(avoir.totalTTC),
      originalInvoice: avoir.factureOrigine.numero,
      lines: lineRows(avoir.lignes),
    };
  }
  return { found: false, numero };
}

const searchQuotesArgs = z.object({
  status: z.enum(DEVIS_STATUSES).optional(),
  client: clientFilter,
  ...range,
  sort: z.enum(["recent", "total"]).default("recent"),
  limit: limit(25, 10),
});
async function searchQuotes(args: z.infer<typeof searchQuotesArgs>) {
  const where = {
    ...nameContains(args.client),
    ...(args.status && { statut: args.status }),
    ...(dateRange(args.from, args.to) && { dateEmission: dateRange(args.from, args.to) }),
  };
  const [byStatus, rows] = await Promise.all([
    prisma.devis.groupBy({ by: ["statut"], where, _count: true, _sum: { totalTTC: true } }),
    prisma.devis.findMany({
      where,
      include: { client: { select: { nom: true } }, facture: { select: { numero: true } } },
      orderBy: args.sort === "total" ? { totalTTC: "desc" } : { dateEmission: "desc" },
      take: args.limit,
    }),
  ]);
  return {
    matched: byStatus.reduce((s, g) => s + g._count, 0),
    totalTTC: round(byStatus.reduce((s, g) => s + Number(g._sum.totalTTC ?? 0), 0)),
    byStatus: Object.fromEntries(byStatus.map((g) => [g.statut, g._count])),
    rows: rows.map((d) => ({
      numero: d.numero,
      client: d.client.nom,
      issueDate: day(d.dateEmission),
      validUntil: day(d.dateValidite),
      status: d.statut,
      totalTTC: Number(d.totalTTC),
      convertedToInvoice: d.facture?.numero ?? null,
    })),
  };
}

const searchCreditNotesArgs = z.object({
  status: z.enum(AVOIR_STATUSES).optional(),
  client: clientFilter,
  ...range,
  limit: limit(25, 10),
});
async function searchCreditNotes(args: z.infer<typeof searchCreditNotesArgs>) {
  const where = {
    ...nameContains(args.client),
    ...(args.status && { statut: args.status }),
    ...(dateRange(args.from, args.to) && { dateEmission: dateRange(args.from, args.to) }),
  };
  const [byStatus, rows] = await Promise.all([
    prisma.avoir.groupBy({ by: ["statut"], where, _count: true, _sum: { totalTTC: true } }),
    prisma.avoir.findMany({
      where,
      include: { client: { select: { nom: true } }, factureOrigine: { select: { numero: true } } },
      orderBy: { dateEmission: "desc" },
      take: args.limit,
    }),
  ]);
  return {
    matched: byStatus.reduce((s, g) => s + g._count, 0),
    totalTTC: round(byStatus.reduce((s, g) => s + Number(g._sum.totalTTC ?? 0), 0)),
    byStatus: Object.fromEntries(byStatus.map((g) => [g.statut, g._count])),
    rows: rows.map((a) => ({
      numero: a.numero,
      client: a.client.nom,
      issueDate: day(a.dateEmission),
      status: a.statut,
      reason: a.motif,
      totalTTC: Number(a.totalTTC),
      originalInvoice: a.factureOrigine.numero,
    })),
  };
}

const searchClientsArgs = z.object({
  query: z.string().min(1).optional().describe("Part of the client name, city or tax ID"),
  segment: z.enum(SEGMENTS).optional().describe("ML payment-behaviour segment"),
  activeOnly: z.boolean().default(false),
  sort: z.enum(["revenue", "amount_due", "overdue", "invoices", "name"]).default("revenue"),
  limit: limit(25, 10),
});
async function searchClients(args: z.infer<typeof searchClientsArgs>) {
  const q = args.query ? { contains: args.query, mode: "insensitive" as const } : undefined;
  const clients = await prisma.client.findMany({
    where: {
      ...(q && { OR: [{ nom: q }, { ville: q }, { matriculeFiscal: q }] }),
      ...(args.activeOnly && { actif: true }),
      ...(args.segment && { mlSegment: { segment: args.segment } }),
    },
    include: {
      mlSegment: { select: { segment: true } },
      factures: { select: { statut: true, dateEcheance: true, dateEmission: true, totalTTC: true, montantPaye: true } },
      _count: { select: { devis: true, avoirs: true } },
    },
  });
  const rows = clients.map((c) => {
    const billed = c.factures
      .filter((f) => f.statut !== "ANNULEE")
      .map((f) => {
        const totalTTC = Number(f.totalTTC);
        const montantPaye = Number(f.montantPaye);
        const status = computeFactureDisplayStatut({ statut: f.statut, dateEcheance: f.dateEcheance, totalTTC, montantPaye });
        return { totalTTC, due: Math.max(0, totalTTC - montantPaye), status, date: f.dateEmission };
      });
    const lastInvoice = billed.reduce<Date | null>((last, f) => (!last || f.date > last ? f.date : last), null);
    return {
      name: c.nom,
      type: c.type,
      city: c.ville,
      email: c.email,
      phone: c.telephone,
      active: c.actif,
      segment: c.mlSegment?.segment ?? null,
      invoices: c.factures.length,
      quotes: c._count.devis,
      creditNotes: c._count.avoirs,
      totalBilledTTC: round(billed.reduce((s, f) => s + f.totalTTC, 0)),
      amountDue: round(billed.reduce((s, f) => s + f.due, 0)),
      overdueInvoices: billed.filter((f) => f.status === "EN_RETARD").length,
      lastInvoiceDate: day(lastInvoice),
    };
  });
  const sorters: Record<typeof args.sort, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
    revenue: (a, b) => b.totalBilledTTC - a.totalBilledTTC,
    amount_due: (a, b) => b.amountDue - a.amountDue,
    overdue: (a, b) => b.overdueInvoices - a.overdueInvoices,
    invoices: (a, b) => b.invoices - a.invoices,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  rows.sort(sorters[args.sort]);
  return { matched: rows.length, rows: rows.slice(0, args.limit) };
}

const searchProductsArgs = z.object({
  query: z.string().min(1).optional().describe("Part of the name, reference or category"),
  type: z.enum(["PRODUIT", "SERVICE"]).optional(),
  sort: z.enum(["revenue", "quantity", "price", "name"]).default("revenue"),
  limit: limit(25, 10),
});
async function searchProducts(args: z.infer<typeof searchProductsArgs>) {
  const q = args.query ? { contains: args.query, mode: "insensitive" as const } : undefined;
  const [produits, sales] = await Promise.all([
    prisma.produit.findMany({
      where: {
        ...(q && { OR: [{ designation: q }, { reference: q }, { categorie: q }] }),
        ...(args.type && { type: args.type }),
      },
    }),
    prisma.ligneFacture.groupBy({
      by: ["produitId"],
      where: { produitId: { not: null }, facture: { statut: { notIn: ["ANNULEE", "BROUILLON"] } } },
      _sum: { quantite: true, totalHT: true },
    }),
  ]);
  const salesById = new Map(sales.map((s) => [s.produitId, s._sum]));
  const rows = produits.map((p) => {
    const s = salesById.get(p.id);
    return {
      reference: p.reference,
      name: p.designation,
      type: p.type,
      category: p.categorie,
      unitPriceHT: Number(p.prixUnitaireHT),
      vatPct: Number(p.tauxTva),
      unit: p.uniteMesure,
      stock: p.stock,
      active: p.actif,
      quantityInvoiced: Number(s?.quantite ?? 0),
      revenueHT: round(Number(s?.totalHT ?? 0)),
    };
  });
  const sorters: Record<typeof args.sort, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
    revenue: (a, b) => b.revenueHT - a.revenueHT,
    quantity: (a, b) => b.quantityInvoiced - a.quantityInvoiced,
    price: (a, b) => b.unitPriceHT - a.unitPriceHT,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  rows.sort(sorters[args.sort]);
  return { matched: rows.length, note: "Sales exclude draft and cancelled invoices", rows: rows.slice(0, args.limit) };
}

const searchPaymentsArgs = z.object({
  from: isoDate.optional().describe("Payment date from (inclusive)"),
  to: isoDate.optional().describe("Payment date to (inclusive)"),
  method: z.enum(PAYMENT_METHODS).optional(),
  client: clientFilter,
  limit: limit(25, 10),
});
async function searchPayments(args: z.infer<typeof searchPaymentsArgs>) {
  const where = {
    ...(args.method && { modePaiement: args.method }),
    ...(dateRange(args.from, args.to) && { datePaiement: dateRange(args.from, args.to) }),
    ...(args.client && { facture: nameContains(args.client) }),
  };
  const [byMethod, rows] = await Promise.all([
    prisma.paiement.groupBy({ by: ["modePaiement"], where, _count: true, _sum: { montant: true } }),
    prisma.paiement.findMany({
      where,
      include: { facture: { select: { numero: true, client: { select: { nom: true } } } } },
      orderBy: { datePaiement: "desc" },
      take: args.limit,
    }),
  ]);
  return {
    matched: byMethod.reduce((s, g) => s + g._count, 0),
    total: round(byMethod.reduce((s, g) => s + Number(g._sum.montant ?? 0), 0)),
    byMethod: Object.fromEntries(byMethod.map((g) => [g.modePaiement, { count: g._count, total: round(Number(g._sum.montant ?? 0)) }])),
    rows: rows.map((p) => ({
      date: day(p.datePaiement),
      amount: Number(p.montant),
      method: p.modePaiement,
      invoice: p.facture.numero,
      client: p.facture.client.nom,
    })),
  };
}

const revenueArgs = z.object({
  from: isoDate.describe("Period start (inclusive)"),
  to: isoDate.describe("Period end (inclusive)"),
  granularity: z.enum(["month", "year"]).default("month"),
  client: clientFilter,
});
async function revenueByPeriod(args: z.infer<typeof revenueArgs>) {
  const range = dateRange(args.from, args.to);
  const [factures, paiements] = await Promise.all([
    loadFactures({ ...nameContains(args.client), dateEmission: range, statut: { not: "ANNULEE" } }),
    prisma.paiement.findMany({
      where: { datePaiement: range, ...(args.client && { facture: nameContains(args.client) }) },
      select: { datePaiement: true, montant: true },
    }),
  ]);
  const key = (d: Date) => (args.granularity === "year" ? String(d.getFullYear()) : `${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  const periods = new Map<string, { invoices: number; billedTTC: number; billedHT: number; collected: number }>();
  const bucket = (k: string) => {
    if (!periods.has(k)) periods.set(k, { invoices: 0, billedTTC: 0, billedHT: 0, collected: 0 });
    return periods.get(k)!;
  };
  for (const f of factures) {
    const b = bucket(key(f.dateEmission));
    b.invoices += 1;
    b.billedTTC += f.totalTTC;
    b.billedHT += f.totalHT;
  }
  for (const p of paiements) bucket(key(p.datePaiement)).collected += Number(p.montant);
  return {
    note: "billed = invoices issued in the period (cancelled excluded); collected = payments received in the period",
    periods: [...periods.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => ({ period, invoices: v.invoices, billedTTC: round(v.billedTTC), billedHT: round(v.billedHT), collected: round(v.collected) })),
  };
}

const mlArgs = z.object({});
async function getMlInsights() {
  const [run, factures, segments] = await Promise.all([
    prisma.mlModelRun.findFirst({ orderBy: { trainedAt: "desc" }, select: { modelVersion: true, trainedAt: true, demoData: true } }),
    loadFactures({ mlScore: { isNot: null } }),
    prisma.mlClientSegment.groupBy({ by: ["segment"], _count: true }),
  ]);
  if (!run) return { available: false, note: "No ML model has been trained/imported yet" };
  const open = factures.filter((f) => f.mlScore?.riskLevel && showsRisk(f.statut, f.resteAPayer));
  const high = open
    .filter((f) => f.mlScore!.riskLevel === "HIGH")
    .sort((a, b) => b.resteAPayer - a.resteAPayer);
  const unusual = factures.filter((f) => f.mlScore?.isAnomaly && f.statut !== "ANNULEE");
  return {
    model: { version: run.modelVersion, trainedOn: day(run.trainedAt), demoData: run.demoData },
    openInvoicesByLateRisk: countBy(open, (f) => f.mlScore!.riskLevel!),
    highRisk: {
      count: high.length,
      amountDue: round(high.reduce((s, f) => s + f.resteAPayer, 0)),
      // Most money at stake; use search_invoices sort=late_risk to rank by probability.
      topByAmountDue: high.slice(0, 5).map(invoiceRow),
    },
    unusualInvoices: { count: unusual.length, examples: unusual.slice(0, 5).map((f) => f.numero) },
    clientsBySegment: Object.fromEntries(segments.map((s) => [s.segment, s._count])),
  };
}

// ---------------------------------------------------------------------------
// Registry

interface ToolDef<S extends z.ZodType> {
  description: string;
  args: S;
  run: (args: z.infer<S>) => Promise<unknown>;
}
const tool = <S extends z.ZodType>(def: ToolDef<S>) => def as unknown as ToolDef<z.ZodType>;

const TOOLS: Record<string, ToolDef<z.ZodType>> = {
  get_overview: tool({
    description: "Global figures: counts and totals of clients, products, invoices (by status), quotes, credit notes and payments; amount to collect, overdue amount, revenue this month/year; today's date.",
    args: overviewArgs,
    run: getOverview,
  }),
  search_invoices: tool({
    description: "Count, total and list invoices (factures) filtered by status, client, issue/due date, ML late risk or unusual flag. Totals cover every match; rows are limited.",
    args: searchInvoicesArgs,
    run: searchInvoices,
  }),
  get_document: tool({
    description: "Full detail of one invoice, quote or credit note by its number: lines, payments, linked documents.",
    args: getDocumentArgs,
    run: getDocument,
  }),
  search_quotes: tool({ description: "Count, total and list quotes (devis).", args: searchQuotesArgs, run: searchQuotes }),
  search_credit_notes: tool({ description: "Count, total and list credit notes (avoirs).", args: searchCreditNotesArgs, run: searchCreditNotes }),
  search_clients: tool({
    description: "Find and rank clients with contact details, number of invoices, total billed, amount due, overdue invoices and ML segment.",
    args: searchClientsArgs,
    run: searchClients,
  }),
  search_products: tool({
    description: "Find and rank products/services with price, VAT, stock, quantity invoiced and revenue (HT).",
    args: searchProductsArgs,
    run: searchProducts,
  }),
  search_payments: tool({ description: "Count, total and list payments received, by date, method or client.", args: searchPaymentsArgs, run: searchPayments }),
  revenue_by_period: tool({
    description: "Amount billed and collected per month or year over a date range (optionally for one client).",
    args: revenueArgs,
    run: revenueByPeriod,
  }),
  get_ml_insights: tool({
    description: "Machine-learning results: late-payment risk of open invoices, high-risk invoices, unusual invoices, client segments, model version.",
    args: mlArgs,
    run: getMlInsights,
  }),
};

/** Tool definitions in the OpenAI Chat Completions format. */
export const openAiTools = Object.entries(TOOLS).map(([name, def]) => {
  const parameters = z.toJSONSchema(def.args, { io: "input" }) as Record<string, unknown>;
  delete parameters.$schema;
  return { type: "function" as const, function: { name, description: def.description, parameters } };
});

/** Runs a tool call from the model. Errors are returned to the model as data, never thrown. */
export async function runTool(name: string, rawArgs: string): Promise<unknown> {
  const def = TOOLS[name];
  if (!def) return { error: `Unknown tool ${name}` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs || "{}");
  } catch {
    return { error: "Arguments are not valid JSON" };
  }
  const args = def.args.safeParse(parsed);
  if (!args.success) return { error: "Invalid arguments", issues: z.prettifyError(args.error) };
  try {
    return await def.run(args.data);
  } catch (err) {
    console.error(`[chat] tool ${name} failed`, err);
    return { error: "The query failed" };
  }
}
