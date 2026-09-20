import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import {
  PAYMENT_METHODS,
  customers,
  invoiceBalances,
  invoices,
  paymentAllocations,
  payments,
  withholdingCertificates,
  type Payment,
  type WithholdingCertificate,
} from "@/db/schema";
import { audit } from "../audit";
import { todayTunis } from "../dates";
import { ServiceError, type Actor } from "../errors";
import { amountSchema, fromMilli, toMilli } from "../money";
import { optText } from "../validation";
import { dateString, type Tx } from "./invoices";

// ---------------------------------------------------------------------------
// Solde et statut de paiement d'une facture (dérivés, jamais stockés)
// ---------------------------------------------------------------------------

export type PaymentStatus = "unpaid" | "partial" | "paid" | "overpaid";

export type PaymentState = {
  status: PaymentStatus;
  /** Échéance dépassée alors qu'il reste un solde à payer. */
  overdue: boolean;
  netToPay: string;
  credited: string;
  paid: string;
  /** Reste dû = net à payer − avoirs − paiements imputés (négatif : à rembourser). */
  due: string;
};

export function paymentStateOf(
  b: { netToPay: string; credited: string; paid: string },
  dueDate: string | null,
  today: string = todayTunis(),
): PaymentState {
  const net = toMilli(b.netToPay);
  const credited = toMilli(b.credited);
  const paid = toMilli(b.paid);
  const due = net - credited - paid;
  const status: PaymentStatus = due < 0n ? "overpaid" : due === 0n ? "paid" : paid + credited > 0n ? "partial" : "unpaid";
  return {
    status,
    overdue: due > 0n && !!dueDate && dueDate < today,
    netToPay: fromMilli(net), credited: fromMilli(credited), paid: fromMilli(paid), due: fromMilli(due),
  };
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Non payée", partial: "Partiellement payée", paid: "Soldée", overpaid: "À rembourser",
};

/** Solde d'une facture validée (null pour un brouillon ou un avoir). */
export async function getInvoiceBalance(db: Pick<Db, "select">, invoiceId: string) {
  const [row] = await db.select().from(invoiceBalances).where(eq(invoiceBalances.invoiceId, invoiceId));
  if (!row || row.netToPay === null) return null;
  return { netToPay: row.netToPay, credited: row.credited ?? "0", paid: row.paid ?? "0" };
}

// ---------------------------------------------------------------------------
// Paiements
// ---------------------------------------------------------------------------

const positiveAmount = amountSchema.refine((v) => toMilli(v) > 0n, "Le montant doit être supérieur à 0");

const allocationSchema = z.object({ invoiceId: z.string().uuid(), amount: positiveAmount });
export type AllocationInput = z.input<typeof allocationSchema>;

export const paymentSchema = z.object({
  customerId: z.string().uuid("Choisissez un client"),
  paymentDate: dateString,
  amount: positiveAmount,
  method: z.enum(PAYMENT_METHODS),
  reference: optText(100),
  notes: optText(500),
  allocations: z.array(allocationSchema).max(200).default([]),
});
export type PaymentInput = z.input<typeof paymentSchema>;

/** Impute des montants d'un paiement à des factures, sous verrou, en vérifiant tous les plafonds. */
async function allocateInTx(
  tx: Tx,
  actor: Actor,
  payment: Payment,
  allocations: { invoiceId: string; amount: string }[],
) {
  if (allocations.length === 0) return;

  // Regroupe les doublons d'une même facture dans la demande.
  const merged = new Map<string, bigint>();
  for (const a of allocations) merged.set(a.invoiceId, (merged.get(a.invoiceId) ?? 0n) + toMilli(a.amount));

  const [existing] = await tx
    .select({ total: sql<string>`coalesce(sum(${paymentAllocations.amount}), 0)::text` })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, payment.id));
  const alreadyAllocated = toMilli(existing?.total ?? "0");
  const requested = [...merged.values()].reduce((s, v) => s + v, 0n);
  if (alreadyAllocated + requested > toMilli(payment.amount)) {
    throw new ServiceError(
      `Les imputations (${fromMilli(alreadyAllocated + requested)} DT) dépassent le montant du paiement (${payment.amount} DT)`,
    );
  }

  // Ordre stable des verrous : pas d'interblocage entre deux paiements simultanés.
  for (const invoiceId of [...merged.keys()].sort()) {
    const amount = merged.get(invoiceId)!;
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
    if (!inv) throw new ServiceError("Facture introuvable");
    if (inv.status !== "validated" || inv.kind === "credit_note") {
      throw new ServiceError("On ne peut imputer un paiement que sur une facture validée");
    }
    if (inv.customerId !== payment.customerId) {
      throw new ServiceError(`La facture ${inv.number} n'appartient pas au client de ce paiement`);
    }
    const [dup] = await tx
      .select({ id: paymentAllocations.paymentId })
      .from(paymentAllocations)
      .where(and(eq(paymentAllocations.paymentId, payment.id), eq(paymentAllocations.invoiceId, invoiceId)));
    if (dup) throw new ServiceError(`Ce paiement est déjà imputé à la facture ${inv.number}`);

    const balance = await getInvoiceBalance(tx, invoiceId);
    const due = balance ? toMilli(balance.netToPay) - toMilli(balance.credited) - toMilli(balance.paid) : 0n;
    if (amount > due) {
      throw new ServiceError(`L'imputation sur ${inv.number} (${fromMilli(amount)} DT) dépasse le reste dû (${fromMilli(due > 0n ? due : 0n)} DT)`);
    }

    await tx.insert(paymentAllocations).values({ paymentId: payment.id, invoiceId, amount: fromMilli(amount) });
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "payment.allocate", entity: "payment", entityId: payment.id,
      after: { invoiceId, invoiceNumber: inv.number, amount: fromMilli(amount) },
    });
  }
}

/** Enregistre un encaissement, avec ses imputations éventuelles (le reste est une avance client). */
export async function recordPayment(db: Db, actor: Actor, input: PaymentInput): Promise<Payment> {
  const data = paymentSchema.parse(input);
  return db.transaction(async (tx) => {
    const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, data.customerId));
    if (!customer) throw new ServiceError("Client introuvable");
    const { allocations, ...values } = data;
    const [payment] = await tx.insert(payments).values({ ...values, createdBy: actor.id }).returning();
    if (!payment) throw new Error("Insertion du paiement échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "payment.create", entity: "payment", entityId: payment.id, after: payment,
    });
    await allocateInTx(tx, actor, payment, allocations);
    return payment;
  });
}

/** Impute (ou complète l'imputation d') un paiement existant. */
export async function allocatePayment(db: Db, actor: Actor, paymentId: string, allocations: AllocationInput[]) {
  const parsed = z.array(allocationSchema).min(1, "Indiquez au moins une imputation").parse(allocations);
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!payment) throw new ServiceError("Paiement introuvable");
    if (payment.voidedAt) throw new ServiceError("Ce paiement est annulé");
    await allocateInTx(tx, actor, payment, parsed);
  });
}

export async function voidPayment(db: Db, actor: Actor, paymentId: string, reason: string) {
  const why = z.string().trim().min(3, "Indiquez le motif de l'annulation").max(300).parse(reason);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!before) throw new ServiceError("Paiement introuvable");
    if (before.voidedAt) throw new ServiceError("Ce paiement est déjà annulé");
    const [after] = await tx
      .update(payments)
      .set({ voidedAt: new Date(), voidReason: why, voidedBy: actor.id })
      .where(eq(payments.id, paymentId))
      .returning();
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "payment.void", entity: "payment", entityId: paymentId, before, after,
    });
    return after;
  });
}

export async function listPayments(
  db: Db,
  opts: { q?: string; customerId?: string; includeVoided?: boolean; page?: number; pageSize?: number } = {},
) {
  const pageSize = opts.pageSize ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const like = opts.q?.trim() ? `%${opts.q.trim().replace(/[\\%_]/g, "\\$&")}%` : null;
  const where = and(
    opts.includeVoided ? undefined : sql`${payments.voidedAt} IS NULL`,
    opts.customerId ? eq(payments.customerId, opts.customerId) : undefined,
    like ? or(ilike(customers.name, like), ilike(payments.reference, like)) : undefined,
  );
  const [rows, [count]] = await Promise.all([
    db
      .select({
        payment: payments,
        customerName: customers.name,
        allocated: sql<string>`coalesce((select sum(a.amount) from payment_allocations a where a.payment_id = ${payments.id}), 0)::text`,
      })
      .from(payments)
      .innerJoin(customers, eq(customers.id, payments.customerId))
      .where(where)
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(payments)
      .innerJoin(customers, eq(customers.id, payments.customerId))
      .where(where),
  ]);
  return { rows, total: count?.n ?? 0, page, pageSize };
}

export async function getPayment(db: Db, id: string) {
  const [payment] = await db.select().from(payments).where(eq(payments.id, id));
  if (!payment) return null;
  const [[customer], allocations] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, payment.customerId)),
    db
      .select({ allocation: paymentAllocations, number: invoices.number, invoiceId: invoices.id })
      .from(paymentAllocations)
      .innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
      .where(eq(paymentAllocations.paymentId, id))
      .orderBy(asc(invoices.number)),
  ]);
  const allocated = allocations.reduce((s, a) => s + toMilli(a.allocation.amount), 0n);
  return {
    payment, customer: customer ?? null, allocations,
    allocated: fromMilli(allocated),
    unallocated: fromMilli(toMilli(payment.amount) - allocated),
  };
}

/** Factures validées d'un client qui ont encore un reste dû (pour imputer un paiement). */
export async function openInvoicesForCustomer(db: Db, customerId: string) {
  const rows = await db
    .select({
      id: invoices.id, number: invoices.number, kind: invoices.kind, issueDate: invoices.issueDate,
      dueDate: invoices.dueDate, netToPay: invoiceBalances.netToPay,
      credited: invoiceBalances.credited, paid: invoiceBalances.paid,
    })
    .from(invoices)
    .innerJoin(invoiceBalances, eq(invoiceBalances.invoiceId, invoices.id))
    .where(and(
      eq(invoices.customerId, customerId),
      sql`(${invoiceBalances.netToPay} - ${invoiceBalances.credited} - ${invoiceBalances.paid}) > 0`,
    ))
    .orderBy(asc(invoices.issueDate), asc(invoices.number));
  return rows.map((r) => ({
    ...r,
    due: fromMilli(toMilli(r.netToPay ?? "0") - toMilli(r.credited ?? "0") - toMilli(r.paid ?? "0")),
  }));
}

/** Paiements imputés à une facture (pour sa fiche). */
export async function paymentsOfInvoice(db: Db, invoiceId: string) {
  return db
    .select({ payment: payments, amount: paymentAllocations.amount })
    .from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(eq(paymentAllocations.invoiceId, invoiceId))
    .orderBy(desc(payments.paymentDate));
}

// ---------------------------------------------------------------------------
// Certificats de retenue à la source remis par le client
// ---------------------------------------------------------------------------

export const certificateSchema = z.object({
  number: z.string().trim().min(1, "Numéro du certificat requis").max(60),
  certificateDate: dateString,
  amount: positiveAmount,
});

export async function addWithholdingCertificate(
  db: Db, actor: Actor, invoiceId: string, input: z.input<typeof certificateSchema>,
): Promise<WithholdingCertificate> {
  const data = certificateSchema.parse(input);
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
    if (!inv || inv.status !== "validated" || inv.kind === "credit_note") {
      throw new ServiceError("Facture validée introuvable");
    }
    const expected = toMilli(inv.withholdingAmount);
    if (expected <= 0n) throw new ServiceError("Cette facture ne comporte pas de retenue à la source");
    const [dup] = await tx
      .select({ id: withholdingCertificates.id })
      .from(withholdingCertificates)
      .where(and(eq(withholdingCertificates.invoiceId, invoiceId), eq(withholdingCertificates.number, data.number)));
    if (dup) throw new ServiceError("Ce numéro de certificat existe déjà pour cette facture");
    const [sum] = await tx
      .select({ total: sql<string>`coalesce(sum(${withholdingCertificates.amount}), 0)::text` })
      .from(withholdingCertificates)
      .where(eq(withholdingCertificates.invoiceId, invoiceId));
    if (toMilli(sum?.total ?? "0") + toMilli(data.amount) > expected) {
      throw new ServiceError(`Les certificats dépasseraient la retenue de la facture (${fromMilli(expected)} DT)`);
    }
    const [created] = await tx
      .insert(withholdingCertificates)
      .values({ ...data, invoiceId, createdBy: actor.id })
      .returning();
    if (!created) throw new Error("Insertion du certificat échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "withholding_certificate.create", entity: "invoice", entityId: invoiceId, after: created,
    });
    return created;
  });
}

export async function listWithholdingCertificates(db: Db, invoiceId: string) {
  return db
    .select()
    .from(withholdingCertificates)
    .where(eq(withholdingCertificates.invoiceId, invoiceId))
    .orderBy(asc(withholdingCertificates.certificateDate));
}
