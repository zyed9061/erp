import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import {
  customers,
  invoiceLines,
  invoices,
  quoteLines,
  quotes,
  type Invoice,
  type Quote,
  type QuoteStatus,
} from "@/db/schema";
import { audit } from "../audit";
import { todayTunis } from "../dates";
import { ServiceError, type Actor } from "../errors";
import { divRound, formatPercent, fromMilli, toMilli } from "../money";
import { nextDocumentNumber } from "../numbering";
import { percentSchema } from "../taxes";
import { optText } from "../validation";
import { calculateInvoice, type CalcResult } from "./calc";
import {
  createDraftFromResolved, dateString, invoiceLineSchema, loadContext, resolveLines,
  type ResolvedLine, type Tx,
} from "./invoices";

// ---------------------------------------------------------------------------
// Saisie et calcul
// ---------------------------------------------------------------------------

export const quoteInputSchema = z.object({
  customerId: z.string().uuid("Choisissez un client"),
  issueDate: dateString,
  validUntil: z.union([z.literal(""), dateString]).optional().transform((v) => v || null),
  reference: optText(100),
  notes: optText(2000),
  lines: z.array(invoiceLineSchema).min(1, "Ajoutez au moins une ligne").max(200, "200 lignes maximum"),
});
export type QuoteInput = z.input<typeof quoteInputSchema>;

const NO_EXTRAS = { stampDuty: "0.000", withholdingRate: null, withholdingBase: "ttc", withholdingThreshold: "0.000" } as const;

/** Un devis n'a ni timbre ni retenue : ils n'apparaissent qu'à la facture. */
function calcQuote(lines: ResolvedLine[]): CalcResult {
  return calculateInvoice(lines, NO_EXTRAS);
}

function quoteHeaderValues(calc: CalcResult) {
  const t = calc.totals;
  return {
    totalGross: t.gross, totalDiscount: t.discount, totalHt: t.ht, totalFodec: t.fodec,
    totalTvaBase: t.tvaBase, totalTva: t.tva, totalTtc: t.ttc,
  };
}

async function writeQuoteLines(tx: Tx, quoteId: string, lines: ResolvedLine[], calc: CalcResult) {
  await tx.insert(quoteLines).values(
    lines.map((l, i) => ({
      quoteId, position: i + 1, productId: l.productId, description: l.description, quantity: l.quantity,
      unit: l.unit, unitPrice: l.unitPrice, discountPercent: l.discountPercent,
      tvaCode: l.tvaCode, tvaRate: l.tvaRate, fodecRate: l.fodecRate,
      lineGross: calc.lines[i]!.gross, lineDiscount: calc.lines[i]!.discount,
      lineNetHt: calc.lines[i]!.netHt, lineFodec: calc.lines[i]!.fodec,
    })),
  );
}

// ---------------------------------------------------------------------------
// Brouillon, envoi, décision
// ---------------------------------------------------------------------------

export async function createDraftQuote(db: Db, actor: Actor, input: QuoteInput): Promise<Quote> {
  const data = quoteInputSchema.parse(input);
  if (data.validUntil && data.validUntil < data.issueDate) {
    throw new ServiceError("La validité ne peut pas précéder la date d'émission");
  }
  return db.transaction(async (tx) => {
    const ctx = await loadContext(tx, data.customerId);
    if (!ctx.customer.isActive) throw new ServiceError("Ce client est désactivé");
    const lines = await resolveLines(tx, data.lines, ctx.vatExempt, new Set());
    const calc = calcQuote(lines);
    const [created] = await tx
      .insert(quotes)
      .values({
        customerId: data.customerId, issueDate: data.issueDate, validUntil: data.validUntil,
        reference: data.reference, notes: data.notes, createdBy: actor.id, ...quoteHeaderValues(calc),
      })
      .returning();
    if (!created) throw new Error("Insertion du devis échouée");
    await writeQuoteLines(tx, created.id, lines, calc);
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "quote.create", entity: "quote", entityId: created.id, after: { ...created, lineCount: lines.length },
    });
    return created;
  });
}

export async function updateDraftQuote(
  db: Db, actor: Actor, id: string, input: QuoteInput, expectedVersion?: number,
): Promise<Quote> {
  const data = quoteInputSchema.parse(input);
  if (data.validUntil && data.validUntil < data.issueDate) {
    throw new ServiceError("La validité ne peut pas précéder la date d'émission");
  }
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(quotes).where(eq(quotes.id, id)).for("update");
    if (!before) throw new ServiceError("Devis introuvable");
    if (before.status !== "draft") throw new ServiceError("Ce devis est envoyé : il ne peut plus être modifié");
    if (expectedVersion !== undefined && expectedVersion !== before.version) {
      throw new ServiceError("Ce brouillon a été modifié entre-temps : rechargez la page");
    }
    const ctx = await loadContext(tx, data.customerId);
    if (data.customerId !== before.customerId && !ctx.customer.isActive) throw new ServiceError("Ce client est désactivé");
    const existing = await tx.select({ code: quoteLines.tvaCode }).from(quoteLines).where(eq(quoteLines.quoteId, id));
    const lines = await resolveLines(tx, data.lines, ctx.vatExempt, new Set(existing.map((e) => e.code)));
    const calc = calcQuote(lines);

    await tx.delete(quoteLines).where(eq(quoteLines.quoteId, id));
    const [after] = await tx
      .update(quotes)
      .set({
        customerId: data.customerId, issueDate: data.issueDate, validUntil: data.validUntil,
        reference: data.reference, notes: data.notes, version: before.version + 1, updatedAt: new Date(),
        ...quoteHeaderValues(calc),
      })
      .where(eq(quotes.id, id))
      .returning();
    if (!after) throw new Error("Mise à jour du devis échouée");
    await writeQuoteLines(tx, id, lines, calc);
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "quote.update", entity: "quote", entityId: id, before, after: { ...after, lineCount: lines.length },
    });
    return after;
  });
}

export async function deleteDraftQuote(db: Db, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(quotes).where(eq(quotes.id, id)).for("update");
    if (!before) throw new ServiceError("Devis introuvable");
    if (before.status !== "draft") throw new ServiceError("Un devis envoyé ne peut pas être supprimé");
    await tx.delete(quotes).where(eq(quotes.id, id));
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "quote.delete", entity: "quote", entityId: id, before,
    });
  });
}

/** Envoie le devis : attribue son numéro (sans trou) et le verrouille. */
export async function sendQuote(db: Db, actor: Actor, id: string): Promise<Quote> {
  return db.transaction(async (tx) => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, id)).for("update");
    if (!quote) throw new ServiceError("Devis introuvable");
    if (quote.status !== "draft") throw new ServiceError("Ce devis est déjà envoyé");
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(quoteLines).where(eq(quoteLines.quoteId, id));
    if (!count?.n) throw new ServiceError("Ajoutez au moins une ligne avant d'envoyer");

    const num = await nextDocumentNumber(tx, "quote", new Date(`${quote.issueDate}T12:00:00Z`));
    const [after] = await tx
      .update(quotes)
      .set({
        status: "sent", number: num.number, seriesYear: num.fiscalYear, sequence: num.sequence,
        sentAt: new Date(), version: quote.version + 1, updatedAt: new Date(),
      })
      .where(eq(quotes.id, id))
      .returning();
    if (!after) throw new Error("Envoi du devis échoué");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "quote.send", entity: "quote", entityId: id, after: { status: "sent", number: after.number },
    });
    return after;
  });
}

export async function decideQuote(db: Db, actor: Actor, id: string, decision: "accepted" | "declined"): Promise<Quote> {
  return db.transaction(async (tx) => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, id)).for("update");
    if (!quote) throw new ServiceError("Devis introuvable");
    if (quote.status !== "sent") throw new ServiceError("Seul un devis envoyé peut être accepté ou refusé");
    if (decision === "accepted" && quote.validUntil && quote.validUntil < todayTunis()) {
      throw new ServiceError(`Ce devis a expiré le ${quote.validUntil}`);
    }
    const [after] = await tx
      .update(quotes)
      .set({ status: decision, decidedAt: new Date(), version: quote.version + 1, updatedAt: new Date() })
      .where(eq(quotes.id, id))
      .returning();
    if (!after) throw new Error("Décision échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: `quote.${decision}`, entity: "quote", entityId: id, before: { status: quote.status }, after: { status: decision },
    });
    return after;
  });
}

// ---------------------------------------------------------------------------
// Acomptes et facture finale
// ---------------------------------------------------------------------------

const toResolved = (l: typeof quoteLines.$inferSelect): ResolvedLine => ({
  productId: l.productId, description: l.description, quantity: l.quantity, unit: l.unit,
  unitPrice: l.unitPrice, discountPercent: l.discountPercent,
  tvaCode: l.tvaCode, tvaRate: l.tvaRate, fodecRate: l.fodecRate,
});

async function loadAcceptedQuote(tx: Tx, quoteId: string) {
  // Verrou : sérialise les créations d'acompte / de facture finale sur un même devis.
  const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
  if (!quote) throw new ServiceError("Devis introuvable");
  if (quote.status !== "accepted") throw new ServiceError("Le devis doit être accepté avant d'être facturé");
  const lines = await tx.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId)).orderBy(asc(quoteLines.position));
  const related = await tx.select().from(invoices).where(eq(invoices.quoteId, quoteId));
  return { quote, lines, related };
}

export const depositSchema = z.object({
  percent: percentSchema.refine((v) => toMilli(v) > 0n, "Le pourcentage doit être supérieur à 0"),
  issueDate: dateString.optional(),
});

/**
 * Crée une facture d'acompte : p % du devis, une ligne par taux de TVA (base = HT + FODEC).
 * Pas de timbre sur l'acompte : il est appliqué une seule fois, à la facture finale.
 */
export async function createDepositInvoiceDraft(
  db: Db, actor: Actor, quoteId: string, input: z.input<typeof depositSchema>,
): Promise<Invoice> {
  const data = depositSchema.parse(input);
  const pMilli = toMilli(data.percent);
  return db.transaction(async (tx) => {
    const { quote, lines, related } = await loadAcceptedQuote(tx, quoteId);
    if (related.some((i) => i.kind === "invoice")) {
      throw new ServiceError("La facture finale existe déjà : on ne peut plus créer d'acompte");
    }
    const already = related
      .filter((i) => i.kind === "deposit_invoice")
      .reduce((s, i) => s + toMilli(i.depositPercent ?? "0"), 0n);
    if (already + pMilli > 100000n) {
      throw new ServiceError(`Le total des acomptes dépasserait 100 % (déjà facturé : ${formatPercent(fromMilli(already))})`);
    }

    const calc = calcQuote(lines.map(toResolved));
    const tvaRows = calc.taxes.filter((t) => t.kind === "tva");
    const depositLines: ResolvedLine[] = [];
    for (const row of tvaRows) {
      const base = divRound(toMilli(row.base) * pMilli, 100000n);
      if (base <= 0n) continue;
      const code = lines.find((l) => toMilli(l.tvaRate) === toMilli(row.rate))?.tvaCode ?? "TVA";
      depositLines.push({
        productId: null,
        description: `Acompte de ${formatPercent(data.percent)} sur le devis ${quote.number}${tvaRows.length > 1 ? ` (TVA ${formatPercent(row.rate)})` : ""}`,
        quantity: "1.000", unit: "forfait", unitPrice: fromMilli(base), discountPercent: "0.000",
        tvaCode: code, tvaRate: row.rate, fodecRate: "0.000",
      });
    }
    if (depositLines.length === 0) throw new ServiceError("Le montant de l'acompte est nul");

    return createDraftFromResolved(tx, actor, {
      kind: "deposit_invoice", customerId: quote.customerId, lines: depositLines,
      issueDate: data.issueDate ?? todayTunis(), reference: quote.number,
      quoteId, depositPercent: data.percent,
    });
  });
}

/**
 * Crée la facture finale d'un devis accepté : toutes ses lignes, puis une ligne de déduction
 * (montant négatif, même taux de TVA) pour chaque acompte validé. Ainsi la TVA n'est jamais
 * comptée deux fois.
 */
export async function createInvoiceFromQuote(
  db: Db, actor: Actor, quoteId: string, input: { issueDate?: string } = {},
): Promise<Invoice> {
  const issueDate = input.issueDate ? dateString.parse(input.issueDate) : todayTunis();
  return db.transaction(async (tx) => {
    const { quote, lines, related } = await loadAcceptedQuote(tx, quoteId);
    const existingFinal = related.find((i) => i.kind === "invoice");
    if (existingFinal) {
      throw new ServiceError(`Ce devis a déjà une facture finale (${existingFinal.number ?? "brouillon"})`);
    }
    const deposits = related.filter((i) => i.kind === "deposit_invoice");
    const pending = deposits.filter((d) => d.status !== "validated");
    if (pending.length > 0) {
      throw new ServiceError("Validez ou supprimez les acomptes en brouillon avant de créer la facture finale");
    }

    const resolved = lines.map(toResolved);
    for (const dep of deposits) {
      const depLines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, dep.id)).orderBy(asc(invoiceLines.position));
      for (const l of depLines) {
        resolved.push({
          productId: null,
          description: `Acompte déjà facturé ${dep.number}${depLines.length > 1 ? ` (TVA ${formatPercent(l.tvaRate)})` : ""}`,
          quantity: "1.000", unit: "forfait", unitPrice: fromMilli(-toMilli(l.unitPrice)), discountPercent: "0.000",
          tvaCode: l.tvaCode, tvaRate: l.tvaRate, fodecRate: "0.000",
        });
      }
    }

    return createDraftFromResolved(tx, actor, {
      kind: "invoice", customerId: quote.customerId, lines: resolved, issueDate,
      reference: quote.number, notes: quote.notes, quoteId,
    });
  });
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function getQuote(db: Db, id: string) {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!quote) return null;
  const [lines, [customer], related] = await Promise.all([
    db.select().from(quoteLines).where(eq(quoteLines.quoteId, id)).orderBy(asc(quoteLines.position)),
    db.select().from(customers).where(eq(customers.id, quote.customerId)),
    db.select().from(invoices).where(eq(invoices.quoteId, id)).orderBy(asc(invoices.createdAt)),
  ]);
  const deposits = related.filter((i) => i.kind === "deposit_invoice");
  return {
    quote, lines, customer: customer ?? null,
    taxes: calcQuote(lines.map(toResolved)).taxes,
    deposits,
    finalInvoice: related.find((i) => i.kind === "invoice") ?? null,
    depositPercent: fromMilli(deposits.reduce((s, d) => s + toMilli(d.depositPercent ?? "0"), 0n)),
    expired: quote.status === "sent" && !!quote.validUntil && quote.validUntil < todayTunis(),
  };
}

export async function listQuotes(
  db: Db,
  opts: { q?: string; status?: QuoteStatus; customerId?: string; page?: number; pageSize?: number } = {},
) {
  const pageSize = opts.pageSize ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const like = opts.q?.trim() ? `%${opts.q.trim().replace(/[\\%_]/g, "\\$&")}%` : null;
  const where = and(
    opts.status ? eq(quotes.status, opts.status) : undefined,
    opts.customerId ? eq(quotes.customerId, opts.customerId) : undefined,
    like ? or(ilike(quotes.number, like), ilike(customers.name, like), ilike(quotes.reference, like)) : undefined,
  );
  const [rows, [count]] = await Promise.all([
    db
      .select({ quote: quotes, customerName: customers.name })
      .from(quotes)
      .innerJoin(customers, eq(customers.id, quotes.customerId))
      .where(where)
      .orderBy(desc(quotes.issueDate), desc(quotes.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(quotes)
      .innerJoin(customers, eq(customers.id, quotes.customerId))
      .where(where),
  ]);
  return { rows, total: count?.n ?? 0, page, pageSize };
}

