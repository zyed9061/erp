import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import {
  customers, deliveryNoteLines, deliveryNotes, products, taxRates,
  type DeliveryNote, type DeliveryStatus, type Invoice,
} from "@/db/schema";
import { audit } from "./audit";
import { todayTunis } from "./dates";
import { ServiceError, type Actor } from "./errors";
import {
  createDraftFromResolved, dateString, loadContext, type ResolvedLine, type Tx,
} from "./invoicing/invoices";
import { amountSchema, fromMilli, toMilli } from "./money";
import { nextDocumentNumber } from "./numbering";
import { applyMovement } from "./stock";
import { optText } from "./validation";

// ---------------------------------------------------------------------------
// Saisie
// ---------------------------------------------------------------------------

const positive = amountSchema.refine((v) => toMilli(v) > 0n, "La quantité doit être supérieure à 0");

export const deliveryLineSchema = z.object({
  productId: z.string().uuid("Choisissez un produit"),
  description: optText(500),
  quantity: positive,
  unit: optText(30),
  /** Facultatif : par défaut, le prix du produit à l'enregistrement. */
  unitPrice: z.union([z.literal(""), amountSchema]).optional().transform((v) => v || null),
});

export const deliveryInputSchema = z.object({
  customerId: z.string().uuid("Choisissez un client"),
  issueDate: dateString,
  reference: optText(100),
  notes: optText(2000),
  lines: z.array(deliveryLineSchema).min(1, "Ajoutez au moins une ligne").max(200, "200 lignes maximum"),
});
export type DeliveryInput = z.input<typeof deliveryInputSchema>;

/** Résout les lignes : produit (bien actif), désignation, unité, prix et taxes copiés du produit. */
async function resolveLines(tx: Tx, customerId: string, lines: z.output<typeof deliveryLineSchema>[]) {
  const ctx = await loadContext(tx, customerId);
  if (!ctx.customer.isActive) throw new ServiceError("Ce client est désactivé");

  const ids = [...new Set(lines.map((l) => l.productId))];
  const found = await tx.select().from(products).where(inArray(products.id, ids));
  const byId = new Map(found.map((p) => [p.id, p]));
  const rates = found.length
    ? await tx.select().from(taxRates).where(inArray(taxRates.id, [...new Set(found.map((p) => p.tvaRateId))]))
    : [];
  const rateById = new Map(rates.map((r) => [r.id, r]));

  const needsFodec = found.some((p) => p.fodecApplicable);
  const [fodec] = needsFodec
    ? await tx.select().from(taxRates).where(and(eq(taxRates.kind, "fodec"), eq(taxRates.isActive, true))).orderBy(asc(taxRates.code)).limit(1)
    : [];

  return lines.map((l) => {
    const p = byId.get(l.productId);
    if (!p) throw new ServiceError("Produit introuvable");
    if (p.type !== "bien") throw new ServiceError(`« ${p.name} » est un service : un bon de livraison ne porte que sur des biens`);
    if (!p.isActive) throw new ServiceError(`« ${p.name} » est désactivé`);
    const rate = rateById.get(p.tvaRateId);
    if (!ctx.vatExempt && (!rate || rate.kind !== "tva")) throw new ServiceError(`Taux de TVA invalide pour « ${p.name} »`);
    if (p.fodecApplicable && !fodec) throw new ServiceError("Aucun taux de FODEC actif (Paramètres › Taxes)");
    return {
      productId: p.id,
      description: l.description ?? p.name,
      quantity: l.quantity,
      unit: l.unit ?? p.unit,
      unitPrice: l.unitPrice ?? p.unitPrice,
      tvaCode: ctx.vatExempt ? "EXO" : rate!.code,
      tvaRate: ctx.vatExempt ? "0.000" : rate!.rate,
      fodecRate: p.fodecApplicable && fodec ? fodec.rate : "0.000",
    };
  });
}

async function writeLines(tx: Tx, noteId: string, lines: Awaited<ReturnType<typeof resolveLines>>) {
  await tx.insert(deliveryNoteLines).values(lines.map((l, i) => ({ deliveryNoteId: noteId, position: i + 1, ...l })));
}

// ---------------------------------------------------------------------------
// Brouillon
// ---------------------------------------------------------------------------

export async function createDraftDeliveryNote(db: Db, actor: Actor, input: DeliveryInput): Promise<DeliveryNote> {
  const data = deliveryInputSchema.parse(input);
  return db.transaction(async (tx) => {
    const lines = await resolveLines(tx, data.customerId, data.lines);
    const [created] = await tx
      .insert(deliveryNotes)
      .values({
        customerId: data.customerId, issueDate: data.issueDate, reference: data.reference, notes: data.notes,
        createdBy: actor.id,
      })
      .returning();
    if (!created) throw new Error("Insertion du bon de livraison échouée");
    await writeLines(tx, created.id, lines);
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "delivery_note.create", entity: "delivery_note", entityId: created.id,
      after: { ...created, lineCount: lines.length },
    });
    return created;
  });
}

export async function updateDraftDeliveryNote(
  db: Db, actor: Actor, id: string, input: DeliveryInput, expectedVersion?: number,
): Promise<DeliveryNote> {
  const data = deliveryInputSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(deliveryNotes).where(eq(deliveryNotes.id, id)).for("update");
    if (!before) throw new ServiceError("Bon de livraison introuvable");
    if (before.status !== "draft") throw new ServiceError("Ce bon est validé : il ne peut plus être modifié");
    if (expectedVersion !== undefined && expectedVersion !== before.version) {
      throw new ServiceError("Ce brouillon a été modifié entre-temps : rechargez la page");
    }
    const lines = await resolveLines(tx, data.customerId, data.lines);
    await tx.delete(deliveryNoteLines).where(eq(deliveryNoteLines.deliveryNoteId, id));
    const [after] = await tx
      .update(deliveryNotes)
      .set({
        customerId: data.customerId, issueDate: data.issueDate, reference: data.reference, notes: data.notes,
        version: before.version + 1, updatedAt: new Date(),
      })
      .where(eq(deliveryNotes.id, id))
      .returning();
    if (!after) throw new Error("Mise à jour du bon échouée");
    await writeLines(tx, id, lines);
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "delivery_note.update", entity: "delivery_note", entityId: id, before, after: { ...after, lineCount: lines.length },
    });
    return after;
  });
}

export async function deleteDraftDeliveryNote(db: Db, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(deliveryNotes).where(eq(deliveryNotes.id, id)).for("update");
    if (!before) throw new ServiceError("Bon de livraison introuvable");
    if (before.status !== "draft") throw new ServiceError("Un bon validé ne peut pas être supprimé (annulez-le)");
    await tx.delete(deliveryNotes).where(eq(deliveryNotes.id, id));
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "delivery_note.delete", entity: "delivery_note", entityId: id, before,
    });
  });
}

// ---------------------------------------------------------------------------
// Validation (numéro sans trou + sortie de stock) et annulation
// ---------------------------------------------------------------------------

/**
 * Valide le bon : numéro sans trou et sortie du stock, dans UNE transaction. Un stock insuffisant annule tout
 * (le numéro est restitué, aucun mouvement n'est enregistré).
 */
export async function validateDeliveryNote(db: Db, actor: Actor, id: string): Promise<DeliveryNote> {
  return db.transaction(async (tx) => {
    const [note] = await tx.select().from(deliveryNotes).where(eq(deliveryNotes.id, id)).for("update");
    if (!note) throw new ServiceError("Bon de livraison introuvable");
    if (note.status !== "draft") throw new ServiceError("Ce bon est déjà validé");
    const lines = await tx.select().from(deliveryNoteLines).where(eq(deliveryNoteLines.deliveryNoteId, id)).orderBy(asc(deliveryNoteLines.position));
    if (lines.length === 0) throw new ServiceError("Ajoutez au moins une ligne avant de valider");

    const num = await nextDocumentNumber(tx, "delivery_note", new Date(`${note.issueDate}T12:00:00Z`));

    // Une sortie par produit (quantités des lignes cumulées), dans un ordre stable.
    const perProduct = new Map<string, bigint>();
    for (const l of lines) perProduct.set(l.productId, (perProduct.get(l.productId) ?? 0n) + toMilli(l.quantity));
    const tracked = await tx.select({ id: products.id }).from(products)
      .where(and(inArray(products.id, [...perProduct.keys()]), eq(products.trackStock, true)));
    for (const { id: productId } of tracked.sort((a, b) => (a.id < b.id ? -1 : 1))) {
      await applyMovement(tx, actor, {
        productId, type: "delivery", quantity: fromMilli(-perProduct.get(productId)!), occurredOn: note.issueDate,
        reference: num.number, notes: "Livraison", deliveryNoteId: id,
      });
    }

    const [after] = await tx
      .update(deliveryNotes)
      .set({
        status: "validated", number: num.number, seriesYear: num.fiscalYear, sequence: num.sequence,
        validatedAt: new Date(), version: note.version + 1, updatedAt: new Date(),
      })
      .where(eq(deliveryNotes.id, id))
      .returning();
    if (!after) throw new Error("Validation échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "delivery_note.validate", entity: "delivery_note", entityId: id, after: { number: after.number },
    });
    return after;
  });
}

/** Annule un bon validé non facturé : remet la marchandise en stock. Le numéro reste attribué. */
export async function cancelDeliveryNote(db: Db, actor: Actor, id: string, reason: string): Promise<DeliveryNote> {
  const why = z.string().trim().min(3, "Indiquez le motif de l'annulation").max(300).parse(reason);
  return db.transaction(async (tx) => {
    const [note] = await tx.select().from(deliveryNotes).where(eq(deliveryNotes.id, id)).for("update");
    if (!note) throw new ServiceError("Bon de livraison introuvable");
    if (note.status !== "validated") throw new ServiceError("Seul un bon validé peut être annulé");
    if (note.invoiceId) throw new ServiceError("Ce bon est repris dans une facture : supprimez d'abord le brouillon de facture");

    const lines = await tx.select().from(deliveryNoteLines).where(eq(deliveryNoteLines.deliveryNoteId, id));
    const perProduct = new Map<string, bigint>();
    for (const l of lines) perProduct.set(l.productId, (perProduct.get(l.productId) ?? 0n) + toMilli(l.quantity));
    const tracked = await tx.select({ id: products.id }).from(products)
      .where(and(inArray(products.id, [...perProduct.keys()]), eq(products.trackStock, true)));
    for (const { id: productId } of tracked.sort((a, b) => (a.id < b.id ? -1 : 1))) {
      await applyMovement(tx, actor, {
        productId, type: "delivery", quantity: fromMilli(perProduct.get(productId)!), occurredOn: note.issueDate,
        reference: `Annulation ${note.number}`, notes: why, deliveryNoteId: id,
      });
    }
    const [after] = await tx
      .update(deliveryNotes)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: why, version: note.version + 1, updatedAt: new Date() })
      .where(eq(deliveryNotes.id, id))
      .returning();
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "delivery_note.cancel", entity: "delivery_note", entityId: id, before: { status: "validated" }, after: { status: "cancelled", reason: why },
    });
    return after!;
  });
}

// ---------------------------------------------------------------------------
// Facturation des bons de livraison
// ---------------------------------------------------------------------------

/**
 * Crée un brouillon de facture reprenant les lignes de plusieurs bons validés d'un même client, aux prix et taxes
 * figés sur les bons. Chaque bon est rattaché à la facture : il ne peut plus être facturé deux fois.
 */
export async function createInvoiceFromDeliveryNotes(
  db: Db, actor: Actor, input: { noteIds: string[]; issueDate?: string },
): Promise<Invoice> {
  const noteIds = z.array(z.string().uuid()).min(1, "Choisissez au moins un bon de livraison").max(100).parse(input.noteIds);
  const issueDate = input.issueDate ? dateString.parse(input.issueDate) : undefined;

  return db.transaction(async (tx) => {
    // Verrou dans un ordre stable : deux facturations simultanées ne peuvent pas reprendre le même bon.
    const notes = await tx.select().from(deliveryNotes).where(inArray(deliveryNotes.id, noteIds)).orderBy(asc(deliveryNotes.id)).for("update");
    if (notes.length !== new Set(noteIds).size) throw new ServiceError("Bon de livraison introuvable");
    for (const n of notes) {
      if (n.status !== "validated") throw new ServiceError(`Le bon ${n.number ?? "(brouillon)"} n'est pas validé`);
      if (n.invoiceId) throw new ServiceError(`Le bon ${n.number} est déjà repris dans une facture`);
    }
    if (new Set(notes.map((n) => n.customerId)).size > 1) {
      throw new ServiceError("Les bons doivent concerner le même client");
    }
    const ordered = [...notes].sort((a, b) => (a.number ?? "").localeCompare(b.number ?? ""));

    const resolved: ResolvedLine[] = [];
    for (const n of ordered) {
      const lines = await tx.select().from(deliveryNoteLines).where(eq(deliveryNoteLines.deliveryNoteId, n.id)).orderBy(asc(deliveryNoteLines.position));
      for (const l of lines) {
        resolved.push({
          productId: l.productId, description: `${l.description} (BL ${n.number})`, quantity: l.quantity, unit: l.unit,
          unitPrice: l.unitPrice, discountPercent: "0.000", tvaCode: l.tvaCode, tvaRate: l.tvaRate, fodecRate: l.fodecRate,
        });
      }
    }

    const invoice = await createDraftFromResolved(tx, actor, {
      kind: "invoice", customerId: ordered[0]!.customerId, lines: resolved,
      issueDate: issueDate ?? todayTunis(),
      reference: ordered.map((n) => n.number).join(", ").slice(0, 100),
    });
    await tx.update(deliveryNotes).set({ invoiceId: invoice.id, version: sql`${deliveryNotes.version} + 1`, updatedAt: new Date() })
      .where(inArray(deliveryNotes.id, ordered.map((n) => n.id)));
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "delivery_note.invoice", entity: "invoice", entityId: invoice.id, after: { deliveryNotes: ordered.map((n) => n.number) },
    });
    return invoice;
  });
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function getDeliveryNote(db: Db, id: string) {
  const [note] = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id));
  if (!note) return null;
  const [lines, [customer]] = await Promise.all([
    db.select().from(deliveryNoteLines).where(eq(deliveryNoteLines.deliveryNoteId, id)).orderBy(asc(deliveryNoteLines.position)),
    db.select().from(customers).where(eq(customers.id, note.customerId)),
  ]);
  return { note, lines, customer: customer ?? null };
}

export async function listDeliveryNotes(
  db: Db,
  opts: { q?: string; status?: DeliveryStatus; customerId?: string; toInvoice?: boolean; page?: number; pageSize?: number } = {},
) {
  const pageSize = opts.pageSize ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const like = opts.q?.trim() ? `%${opts.q.trim().replace(/[\\%_]/g, "\\$&")}%` : null;
  const where = and(
    opts.status ? eq(deliveryNotes.status, opts.status) : undefined,
    opts.customerId ? eq(deliveryNotes.customerId, opts.customerId) : undefined,
    opts.toInvoice ? and(eq(deliveryNotes.status, "validated"), isNull(deliveryNotes.invoiceId)) : undefined,
    like ? or(ilike(deliveryNotes.number, like), ilike(customers.name, like), ilike(deliveryNotes.reference, like)) : undefined,
  );
  const [rows, [count]] = await Promise.all([
    db
      .select({ note: deliveryNotes, customerName: customers.name })
      .from(deliveryNotes)
      .innerJoin(customers, eq(customers.id, deliveryNotes.customerId))
      .where(where)
      .orderBy(desc(deliveryNotes.issueDate), desc(deliveryNotes.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(deliveryNotes).innerJoin(customers, eq(customers.id, deliveryNotes.customerId)).where(where),
  ]);
  return { rows, total: count?.n ?? 0, page, pageSize };
}
