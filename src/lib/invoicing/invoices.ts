import { createHash } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import {
  companySettings,
  customers,
  invoiceLines,
  invoiceBalances,
  invoices,
  invoiceTaxLines,
  paymentTerms,
  taxRates,
  type Customer,
  type Invoice,
  type InvoiceKind,
  type InvoiceLine,
  type InvoiceStatus,
  type InvoiceTaxLine,
  type CompanySettings,
} from "@/db/schema";
import { audit } from "../audit";
import { ServiceError, type Actor } from "../errors";
import { amountSchema, fromMilli, signedAmountSchema, toMilli } from "../money";
import { nextDocumentNumber } from "../numbering";
import { computeDueDate } from "../payment-terms";
import { percentSchema } from "../taxes";
import { optText, optUuid } from "../validation";
import { todayTunis } from "../dates";
import { calculateInvoice, type CalcResult } from "./calc";

export type Tx = Pick<Db, "select" | "insert" | "update" | "delete">;

// Plafond de NUMERIC(15,3) : 999 999 999 999,999 DT
const MAX_MILLI = 999_999_999_999_999n;
const PLACEHOLDER_NAME = "À renseigner";

// ---------------------------------------------------------------------------
// Saisie
// ---------------------------------------------------------------------------

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), "Date invalide");

export const invoiceLineSchema = z.object({
  productId: optUuid,
  description: z.string().trim().min(1, "Désignation requise").max(500),
  quantity: amountSchema.refine((v) => toMilli(v) > 0n, "La quantité doit être supérieure à 0"),
  unit: z.string().trim().min(1, "Unité requise").max(30),
  unitPrice: signedAmountSchema, // négatif autorisé : déduction d'un acompte
  discountPercent: percentSchema.prefault("0"),
  tvaRateId: z.string().uuid("Choisissez un taux de TVA"),
  fodecApplicable: z.boolean().default(false),
});
export type InvoiceLineInput = z.input<typeof invoiceLineSchema>;

export const invoiceInputSchema = z.object({
  customerId: z.string().uuid("Choisissez un client"),
  issueDate: dateString,
  dueDate: z.union([z.literal(""), dateString]).optional().transform((v) => v || null),
  paymentTermId: optUuid,
  reference: optText(100),
  notes: optText(2000),
  lines: z.array(invoiceLineSchema).min(1, "Ajoutez au moins une ligne").max(200, "200 lignes maximum"),
});
export type InvoiceInput = z.input<typeof invoiceInputSchema>;

// ---------------------------------------------------------------------------
// Construction d'un document (brouillon)
// ---------------------------------------------------------------------------

export type ResolvedLine = {
  productId: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountPercent: string;
  tvaCode: string;
  tvaRate: string;
  fodecRate: string;
};

type Context = { customer: Customer; company: CompanySettings; vatExempt: boolean };

export async function loadContext(tx: Tx, customerId: string): Promise<Context> {
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) throw new ServiceError("Client introuvable");
  const [company] = await tx.select().from(companySettings).where(eq(companySettings.id, 1));
  if (!company) throw new Error("Paramètres de la société absents");
  // Client exonéré/export ou société non assujettie : TVA à 0 sur toutes les lignes.
  const vatExempt =
    !company.vatRegistered || customer.taxStatus === "exonere" || customer.taxStatus === "export";
  return { customer, company, vatExempt };
}

export async function resolveLines(
  tx: Tx,
  lines: z.output<typeof invoiceLineSchema>[],
  vatExempt: boolean,
  allowInactiveCodes: Set<string>,
): Promise<ResolvedLine[]> {
  const ids = [...new Set(lines.map((l) => l.tvaRateId))];
  const rates = await tx.select().from(taxRates).where(inArray(taxRates.id, ids));
  const byId = new Map(rates.map((r) => [r.id, r]));

  const needsFodec = lines.some((l) => l.fodecApplicable);
  const [fodec] = needsFodec
    ? await tx
        .select()
        .from(taxRates)
        .where(and(eq(taxRates.kind, "fodec"), eq(taxRates.isActive, true)))
        .orderBy(asc(taxRates.code))
        .limit(1)
    : [];
  if (needsFodec && !fodec) throw new ServiceError("Aucun taux de FODEC actif (Paramètres › Taxes)");

  return lines.map((l) => {
    let tvaCode = "EXO";
    let tvaRate = "0.000";
    if (!vatExempt) {
      const rate = byId.get(l.tvaRateId);
      if (!rate || rate.kind !== "tva") throw new ServiceError("Taux de TVA invalide");
      if (!rate.isActive && !allowInactiveCodes.has(rate.code)) {
        throw new ServiceError(`Le taux « ${rate.label} » est inactif`);
      }
      tvaCode = rate.code;
      tvaRate = rate.rate;
    }
    return {
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      tvaCode,
      tvaRate,
      fodecRate: l.fodecApplicable && fodec ? fodec.rate : "0.000",
    };
  });
}

async function computeDocument(
  tx: Tx,
  ctx: Context,
  p: {
    kind: InvoiceKind;
    lines: ResolvedLine[];
    issueDate: string;
    dueDate: string | null;
    paymentTermId: string | null;
    original: Invoice | null;
    /** Retenue de garantie (BTP) : reprise d'un brouillon existant, du chantier, ou de la facture d'origine (avoir). */
    guaranteeHoldbackRate?: string | null;
  },
) {
  const { customer, company } = ctx;
  const guaranteeHoldbackRate =
    p.kind === "credit_note" ? (p.original?.guaranteeHoldbackRate ?? null) : (p.guaranteeHoldbackRate ?? null);

  let withholdingRate: string | null = null;
  if (p.kind !== "credit_note") {
    if (customer.withholdingApplies && customer.withholdingRateId) {
      const [r] = await tx.select().from(taxRates).where(eq(taxRates.id, customer.withholdingRateId));
      withholdingRate = r?.rate ?? null;
    }
  } else {
    withholdingRate = p.original?.withholdingRate ?? null; // l'avoir reprend la retenue de la facture
  }
  // Timbre : uniquement sur les factures, jamais sur les avoirs (à confirmer, cf. rapport c.3).
  const stampDuty =
    p.kind === "invoice" && company.stampDutyEnabled && !customer.stampExempt
      ? company.stampDutyAmount
      : "0.000";

  const calc = calculateInvoice(p.lines, {
    stampDuty,
    withholdingRate,
    withholdingBase: company.withholdingBase,
    withholdingThreshold: company.withholdingThreshold,
    guaranteeHoldbackRate,
  });
  if (toMilli(calc.totals.netToPay) > MAX_MILLI || toMilli(calc.totals.gross) > MAX_MILLI) {
    throw new ServiceError("Montant total trop élevé");
  }
  if (toMilli(calc.totals.ttc) < 0n) {
    throw new ServiceError("Le total TTC ne peut pas être négatif (déductions supérieures au montant ?)");
  }

  let dueDate = p.dueDate;
  if (p.kind === "credit_note") {
    dueDate = null;
  } else if (!dueDate) {
    const termId = p.paymentTermId ?? customer.paymentTermId;
    const [term] = termId
      ? await tx.select().from(paymentTerms).where(eq(paymentTerms.id, termId))
      : await tx.select().from(paymentTerms).where(eq(paymentTerms.isDefault, true));
    dueDate = term
      ? computeDueDate(new Date(`${p.issueDate}T00:00:00Z`), term).toISOString().slice(0, 10)
      : p.issueDate;
  }
  if (dueDate && dueDate < p.issueDate) {
    throw new ServiceError("L'échéance ne peut pas précéder la date d'émission");
  }

  return { calc, dueDate, withholdingRate, stampDuty, guaranteeHoldbackRate };
}

function headerValues(
  calc: CalcResult,
  extra: { withholdingRate: string | null; stampDuty: string; guaranteeHoldbackRate: string | null },
) {
  const t = calc.totals;
  return {
    totalGross: t.gross,
    totalDiscount: t.discount,
    totalHt: t.ht,
    totalFodec: t.fodec,
    totalTvaBase: t.tvaBase,
    totalTva: t.tva,
    totalTtc: t.ttc,
    stampDuty: extra.stampDuty,
    withholdingRate: extra.withholdingRate,
    withholdingAmount: t.withholdingAmount,
    guaranteeHoldbackRate: extra.guaranteeHoldbackRate,
    guaranteeHoldback: t.guaranteeHoldback,
    netToPay: t.netToPay,
  };
}

async function writeChildren(tx: Tx, invoiceId: string, lines: ResolvedLine[], calc: CalcResult) {
  await tx.insert(invoiceLines).values(
    lines.map((l, i) => ({
      invoiceId,
      position: i + 1,
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      tvaCode: l.tvaCode,
      tvaRate: l.tvaRate,
      fodecRate: l.fodecRate,
      lineGross: calc.lines[i]!.gross,
      lineDiscount: calc.lines[i]!.discount,
      lineNetHt: calc.lines[i]!.netHt,
      lineFodec: calc.lines[i]!.fodec,
    })),
  );
  if (calc.taxes.length > 0) {
    await tx.insert(invoiceTaxLines).values(calc.taxes.map((t) => ({ invoiceId, ...t })));
  }
}

// ---------------------------------------------------------------------------
// Brouillons
// ---------------------------------------------------------------------------

export async function createDraftInvoice(db: Db, actor: Actor, input: InvoiceInput): Promise<Invoice> {
  const data = invoiceInputSchema.parse(input);
  return db.transaction((tx) => createDraftInvoiceTx(tx, actor, data));
}

/** Variante à appeler dans la transaction de l'appelant (ex. facture récurrente : création + suivi atomiques). */
export async function createDraftInvoiceTx(tx: Tx, actor: Actor, data: z.output<typeof invoiceInputSchema>): Promise<Invoice> {
  const ctx = await loadContext(tx, data.customerId);
  if (!ctx.customer.isActive) throw new ServiceError("Ce client est désactivé");
  const lines = await resolveLines(tx, data.lines, ctx.vatExempt, new Set());
  const doc = await computeDocument(tx, ctx, {
    kind: "invoice", lines, issueDate: data.issueDate, dueDate: data.dueDate,
    paymentTermId: data.paymentTermId, original: null,
  });
  const [created] = await tx
    .insert(invoices)
    .values({
      kind: "invoice",
      customerId: data.customerId,
      issueDate: data.issueDate,
      dueDate: doc.dueDate,
      paymentTermId: data.paymentTermId,
      reference: data.reference,
      notes: data.notes,
      createdBy: actor.id,
      ...headerValues(doc.calc, doc),
    })
    .returning();
  if (!created) throw new Error("Insertion de la facture échouée");
  await writeChildren(tx, created.id, lines, doc.calc);
  await audit(tx, {
    userId: actor.id, userEmail: actor.email, ip: actor.ip,
    action: "invoice.create", entity: "invoice", entityId: created.id,
    after: { ...created, lineCount: lines.length },
  });
  return created;
}

export async function updateDraftInvoice(
  db: Db,
  actor: Actor,
  id: string,
  input: InvoiceInput,
  expectedVersion?: number,
): Promise<Invoice> {
  const data = invoiceInputSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
    if (!before) throw new ServiceError("Document introuvable");
    if (before.status !== "draft") {
      throw new ServiceError("Ce document est validé : il ne peut plus être modifié (créez un avoir)");
    }
    if (expectedVersion !== undefined && expectedVersion !== before.version) {
      throw new ServiceError("Ce brouillon a été modifié entre-temps : rechargez la page");
    }

    // Un avoir reste rattaché au client de sa facture d'origine.
    const customerId = before.kind === "credit_note" ? before.customerId : data.customerId;
    const original = before.originalInvoiceId
      ? (await tx.select().from(invoices).where(eq(invoices.id, before.originalInvoiceId)))[0] ?? null
      : null;
    const ctx = await loadContext(tx, customerId);
    if (before.kind === "invoice" && customerId !== before.customerId && !ctx.customer.isActive) {
      throw new ServiceError("Ce client est désactivé");
    }

    // Un taux désactivé depuis la création reste toléré sur les lignes qui l'utilisent déjà.
    const existing = await tx.select({ code: invoiceLines.tvaCode }).from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
    const lines = await resolveLines(tx, data.lines, ctx.vatExempt, new Set(existing.map((e) => e.code)));
    const doc = await computeDocument(tx, ctx, {
      kind: before.kind, lines, issueDate: data.issueDate, dueDate: data.dueDate,
      paymentTermId: data.paymentTermId, original, guaranteeHoldbackRate: before.guaranteeHoldbackRate,
    });

    await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id));
    await tx.delete(invoiceTaxLines).where(eq(invoiceTaxLines.invoiceId, id));
    const [after] = await tx
      .update(invoices)
      .set({
        customerId,
        issueDate: data.issueDate,
        dueDate: doc.dueDate,
        paymentTermId: data.paymentTermId,
        reference: data.reference,
        notes: data.notes,
        version: before.version + 1,
        updatedAt: new Date(),
        ...headerValues(doc.calc, doc),
      })
      .where(eq(invoices.id, id))
      .returning();
    if (!after) throw new Error("Mise à jour du brouillon échouée");
    await writeChildren(tx, id, lines, doc.calc);
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: `${before.kind}.update`, entity: "invoice", entityId: id,
      before, after: { ...after, lineCount: lines.length },
    });
    return after;
  });
}

export async function deleteDraft(db: Db, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
    if (!before) throw new ServiceError("Document introuvable");
    if (before.status !== "draft") {
      throw new ServiceError("Un document validé ne peut pas être supprimé (créez un avoir)");
    }
    await tx.delete(invoices).where(eq(invoices.id, id));
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: `${before.kind}.delete`, entity: "invoice", entityId: id, before,
    });
  });
}

/**
 * Crée un brouillon à partir de lignes déjà résolues (taux copiés) : facture finale ou facture
 * d'acompte issue d'un devis. À appeler dans la transaction de l'appelant.
 */
export async function createDraftFromResolved(
  tx: Tx,
  actor: Actor,
  p: {
    kind: InvoiceKind;
    customerId: string;
    lines: ResolvedLine[];
    issueDate: string;
    reference?: string | null;
    notes?: string | null;
    quoteId?: string | null;
    depositPercent?: string | null;
    projectId?: string | null;
    guaranteeHoldbackRate?: string | null;
  },
): Promise<Invoice> {
  const ctx = await loadContext(tx, p.customerId);
  if (!ctx.customer.isActive) throw new ServiceError("Ce client est désactivé");
  const doc = await computeDocument(tx, ctx, {
    kind: p.kind, lines: p.lines, issueDate: p.issueDate, dueDate: null, paymentTermId: null, original: null,
    guaranteeHoldbackRate: p.guaranteeHoldbackRate ?? null,
  });
  const [created] = await tx
    .insert(invoices)
    .values({
      kind: p.kind,
      customerId: p.customerId,
      issueDate: p.issueDate,
      dueDate: doc.dueDate,
      reference: p.reference ?? null,
      notes: p.notes ?? null,
      quoteId: p.quoteId ?? null,
      depositPercent: p.depositPercent ?? null,
      projectId: p.projectId ?? null,
      createdBy: actor.id,
      ...headerValues(doc.calc, doc),
    })
    .returning();
  if (!created) throw new Error("Insertion du brouillon échouée");
  await writeChildren(tx, created.id, p.lines, doc.calc);
  await audit(tx, {
    userId: actor.id, userEmail: actor.email, ip: actor.ip,
    action: `${p.kind}.create`, entity: "invoice", entityId: created.id,
    after: { ...created, lineCount: p.lines.length },
  });
  return created;
}

// ---------------------------------------------------------------------------
// Avoirs
// ---------------------------------------------------------------------------

/** Total TTC déjà crédité sur une facture (avoirs validés). */
async function creditedTtc(tx: Pick<Db, "select">, originalId: string): Promise<bigint> {
  const [row] = await tx
    .select({ total: sql<string | null>`coalesce(sum(${invoices.totalTtc}), 0)::text` })
    .from(invoices)
    .where(and(eq(invoices.originalInvoiceId, originalId), eq(invoices.status, "validated")));
  return toMilli(row?.total ?? "0");
}

export const creditNoteSchema = z.object({
  reason: z.string().trim().min(3, "Indiquez le motif de l'avoir").max(500),
  issueDate: dateString.optional(),
});

/** Crée un brouillon d'avoir reprenant toutes les lignes de la facture validée (à ajuster ensuite). */
export async function createCreditNoteDraft(
  db: Db,
  actor: Actor,
  originalId: string,
  input: z.input<typeof creditNoteSchema>,
): Promise<Invoice> {
  const data = creditNoteSchema.parse(input);
  return db.transaction(async (tx) => {
    const [original] = await tx.select().from(invoices).where(eq(invoices.id, originalId));
    if (!original) throw new ServiceError("Facture introuvable");
    if (original.kind === "credit_note") throw new ServiceError("On ne peut pas créer un avoir sur un avoir");
    if (original.status !== "validated") {
      throw new ServiceError("Seule une facture validée peut faire l'objet d'un avoir (supprimez ou modifiez le brouillon)");
    }
    const originalLines = await tx
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, originalId))
      .orderBy(asc(invoiceLines.position));
    const lines: ResolvedLine[] = originalLines.map((l) => ({
      productId: l.productId, description: l.description, quantity: l.quantity, unit: l.unit,
      unitPrice: l.unitPrice, discountPercent: l.discountPercent,
      tvaCode: l.tvaCode, tvaRate: l.tvaRate, fodecRate: l.fodecRate,
    }));

    const ctx = await loadContext(tx, original.customerId);
    const issueDate = data.issueDate ?? todayTunis();
    const doc = await computeDocument(tx, ctx, {
      kind: "credit_note", lines, issueDate, dueDate: null, paymentTermId: null, original,
    });
    const [created] = await tx
      .insert(invoices)
      .values({
        kind: "credit_note",
        customerId: original.customerId,
        originalInvoiceId: original.id,
        creditReason: data.reason,
        issueDate,
        dueDate: null,
        reference: original.number,
        createdBy: actor.id,
        ...headerValues(doc.calc, doc),
      })
      .returning();
    if (!created) throw new Error("Insertion de l'avoir échouée");
    await writeChildren(tx, created.id, lines, doc.calc);
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "credit_note.create", entity: "invoice", entityId: created.id,
      after: { ...created, lineCount: lines.length },
    });
    return created;
  });
}

// ---------------------------------------------------------------------------
// Validation : numéro sans trou, instantanés, empreinte, verrouillage
// ---------------------------------------------------------------------------

/**
 * JSON canonique : clés triées récursivement. Indispensable car PostgreSQL (jsonb) ne conserve
 * pas l'ordre des clés : sans cela, l'empreinte changerait entre la validation et la relecture.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** Empreinte SHA-256 du contenu fiscal, dans un ordre canonique, pour détecter toute altération. */
export function computeContentHash(
  inv: Invoice,
  lines: InvoiceLine[],
  taxes: InvoiceTaxLine[],
  customerSnapshot: unknown,
  companySnapshot: unknown,
): string {
  const payload = {
    kind: inv.kind, number: inv.number, seriesYear: inv.seriesYear, sequence: inv.sequence,
    customerId: inv.customerId, originalInvoiceId: inv.originalInvoiceId,
    issueDate: inv.issueDate, dueDate: inv.dueDate, reference: inv.reference, currency: inv.currency,
    totals: [inv.totalGross, inv.totalDiscount, inv.totalHt, inv.totalFodec, inv.totalTvaBase,
      inv.totalTva, inv.totalTtc, inv.stampDuty, inv.withholdingRate, inv.withholdingAmount, inv.netToPay],
    // Ajouté seulement s'il existe : les empreintes des documents sans retenue de garantie restent inchangées.
    ...(inv.guaranteeHoldbackRate ? { guaranteeHoldback: [inv.guaranteeHoldbackRate, inv.guaranteeHoldback] } : {}),
    lines: [...lines].sort((a, b) => a.position - b.position).map((l) => [
      l.position, l.description, l.quantity, l.unit, l.unitPrice, l.discountPercent,
      l.tvaCode, l.tvaRate, l.fodecRate, l.lineGross, l.lineDiscount, l.lineNetHt, l.lineFodec,
    ]),
    taxes: [...taxes]
      .sort((a, b) => a.kind.localeCompare(b.kind) || Number(a.rate) - Number(b.rate))
      .map((t) => [t.kind, t.rate, t.base, t.amount]),
    customerSnapshot,
    companySnapshot,
  };
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

const customerSnapshotOf = (c: Customer) => ({
  code: c.code, type: c.type, name: c.name, matriculeFiscal: c.matriculeFiscal, taxStatus: c.taxStatus,
  address: c.address, city: c.city, postalCode: c.postalCode, country: c.country,
});

const companySnapshotOf = (c: CompanySettings) => ({
  legalName: c.legalName, tradeName: c.tradeName, matriculeFiscal: c.matriculeFiscal, legalForm: c.legalForm,
  capital: c.capital, address: c.address, city: c.city, postalCode: c.postalCode, country: c.country,
  phone: c.phone, email: c.email, bankName: c.bankName, rib: c.rib, taxRegime: c.taxRegime,
});

/**
 * Valide un brouillon (facture ou avoir) : attribue le numéro sans trou, fige les données
 * client/société, calcule l'empreinte, puis verrouille. Tout se passe dans UNE transaction :
 * si une règle échoue, le numéro est restitué et rien n'est modifié.
 */
export async function validateDocument(db: Db, actor: Actor, id: string): Promise<Invoice> {
  return db.transaction((tx) => validateDocumentTx(tx, actor, id));
}

/** Variante à appeler dans la transaction de l'appelant. */
export async function validateDocumentTx(tx: Tx, actor: Actor, id: string): Promise<Invoice> {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
  if (!inv) throw new ServiceError("Document introuvable");
  if (inv.status !== "draft") throw new ServiceError("Ce document est déjà validé");

  const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.position));
  const taxes = await tx.select().from(invoiceTaxLines).where(eq(invoiceTaxLines.invoiceId, id));
  if (lines.length === 0) throw new ServiceError("Ajoutez au moins une ligne avant de valider");

  const ctx = await loadContext(tx, inv.customerId);
  const { company, customer } = ctx;
  if (company.legalName.trim() === PLACEHOLDER_NAME || !company.matriculeFiscal) {
    throw new ServiceError("Renseignez la raison sociale et le matricule fiscal de la société (Paramètres) avant de valider");
  }

  // Garde-fou : les totaux stockés doivent correspondre au recalcul des lignes.
  const recomputed = calculateInvoice(lines, {
    stampDuty: inv.stampDuty,
    withholdingRate: inv.withholdingRate,
    withholdingBase: company.withholdingBase,
    withholdingThreshold: company.withholdingThreshold,
    guaranteeHoldbackRate: inv.guaranteeHoldbackRate,
  });
  if (toMilli(recomputed.totals.netToPay) !== toMilli(inv.netToPay) || toMilli(recomputed.totals.ttc) !== toMilli(inv.totalTtc)) {
    throw new Error(`Totaux incohérents sur le document ${id} : recalcul différent du stocké`);
  }

  if (inv.kind === "credit_note") {
    if (!inv.originalInvoiceId) throw new Error("Avoir sans facture d'origine");
    // Verrou sur la facture d'origine : deux avoirs validés en parallèle ne peuvent pas la dépasser.
    const [original] = await tx.select().from(invoices).where(eq(invoices.id, inv.originalInvoiceId)).for("update");
    if (!original || original.status !== "validated") throw new ServiceError("Facture d'origine introuvable ou non validée");
    const already = await creditedTtc(tx, original.id);
    const remaining = toMilli(original.totalTtc) - already;
    if (toMilli(inv.totalTtc) > remaining) {
      throw new ServiceError(`Le total des avoirs dépasserait la facture ${original.number} (reste à créditer : ${fromMilli(remaining)} DT TTC)`);
    }
  }

  const docType = inv.kind; // les types de document portent le même nom que les types de facture
  const num = await nextDocumentNumber(tx, docType, new Date(`${inv.issueDate}T12:00:00Z`));

  // Chronologie : les numéros doivent suivre l'ordre des dates d'émission.
  const [latest] = await tx
    .select({ d: sql<string | null>`max(${invoices.issueDate})::text` })
    .from(invoices)
    .where(and(eq(invoices.kind, inv.kind), eq(invoices.status, "validated")));
  if (latest?.d && inv.issueDate < latest.d) {
    throw new ServiceError(`La date d'émission (${inv.issueDate}) précède celle du dernier document validé (${latest.d}) : les numéros doivent suivre l'ordre chronologique`);
  }

  const customerSnapshot = customerSnapshotOf(customer);
  const companySnapshot = companySnapshotOf(company);
  const numbered = { ...inv, number: num.number, seriesYear: num.fiscalYear, sequence: num.sequence };
  const contentHash = computeContentHash(numbered, lines, taxes, customerSnapshot, companySnapshot);

  const [after] = await tx
    .update(invoices)
    .set({
      status: "validated",
      number: num.number,
      seriesYear: num.fiscalYear,
      sequence: num.sequence,
      customerSnapshot,
      companySnapshot,
      contentHash,
      validatedAt: new Date(),
      validatedBy: actor.id,
      version: inv.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, id))
    .returning();
  if (!after) throw new Error("Validation échouée");
  await audit(tx, {
    userId: actor.id, userEmail: actor.email, ip: actor.ip,
    action: `${inv.kind}.validate`, entity: "invoice", entityId: id,
    before: { status: "draft" }, after: { status: "validated", number: after.number, contentHash },
  });
  return after;
}

/** Vérifie qu'un document validé n'a pas été altéré (recalcul de l'empreinte). */
export async function verifyInvoiceIntegrity(db: Db, id: string): Promise<boolean> {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!inv || inv.status !== "validated" || !inv.contentHash) return false;
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
  const taxes = await db.select().from(invoiceTaxLines).where(eq(invoiceTaxLines.invoiceId, id));
  return computeContentHash(inv, lines, taxes, inv.customerSnapshot, inv.companySnapshot) === inv.contentHash;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function getInvoice(db: Db, id: string) {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!invoice) return null;
  const [lines, taxes, [customer], credits, [original]] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.position)),
    db.select().from(invoiceTaxLines).where(eq(invoiceTaxLines.invoiceId, id)),
    db.select().from(customers).where(eq(customers.id, invoice.customerId)),
    db.select().from(invoices).where(eq(invoices.originalInvoiceId, id)).orderBy(asc(invoices.createdAt)),
    invoice.originalInvoiceId
      ? db.select().from(invoices).where(eq(invoices.id, invoice.originalInvoiceId))
      : Promise.resolve([] as Invoice[]),
  ]);
  const credited = credits
    .filter((c) => c.status === "validated")
    .reduce((sum, c) => sum + toMilli(c.totalTtc), 0n);
  return {
    invoice, lines, taxes, customer: customer ?? null, credits, original: original ?? null,
    creditedTtc: fromMilli(credited),
    remainingCreditable: invoice.kind === "invoice" && invoice.status === "validated"
      ? fromMilli(toMilli(invoice.totalTtc) - credited)
      : null,
  };
}

export async function listInvoices(
  db: Db,
  opts: {
    q?: string; status?: InvoiceStatus; kind?: InvoiceKind; customerId?: string;
    /** open = reste dû > 0 ; overdue = open et échéance dépassée ; paid = soldé. */
    payment?: "open" | "overdue" | "paid";
    page?: number; pageSize?: number;
  } = {},
) {
  const pageSize = opts.pageSize ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const like = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null;
  const where = and(
    opts.status ? eq(invoices.status, opts.status) : undefined,
    opts.kind ? eq(invoices.kind, opts.kind) : undefined,
    opts.customerId ? eq(invoices.customerId, opts.customerId) : undefined,
    like ? or(ilike(invoices.number, like), ilike(customers.name, like), ilike(invoices.reference, like)) : undefined,
    opts.payment
      ? opts.payment === "paid"
        ? sql`(${invoiceBalances.netToPay} - ${invoiceBalances.credited} - ${invoiceBalances.paid}) <= 0`
        : and(
            sql`(${invoiceBalances.netToPay} - ${invoiceBalances.credited} - ${invoiceBalances.paid}) > 0`,
            opts.payment === "overdue" ? sql`${invoices.dueDate} < ${todayTunis()}` : undefined,
          )
      : undefined,
  );
  const [rows, [count]] = await Promise.all([
    db
      .select({
        invoice: invoices, customerName: customers.name, customerCode: customers.code,
        credited: invoiceBalances.credited, paid: invoiceBalances.paid,
      })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .leftJoin(invoiceBalances, eq(invoiceBalances.invoiceId, invoices.id))
      .where(where)
      .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .leftJoin(invoiceBalances, eq(invoiceBalances.invoiceId, invoices.id))
      .where(where),
  ]);
  return { rows, total: count?.n ?? 0, page, pageSize };
}

