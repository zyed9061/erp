import { and, asc, desc, eq, ilike, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import {
  RECURRING_FREQUENCIES, customers, invoices, recurringRuns, recurringTemplateLines, recurringTemplates,
  type RecurringFrequency, type RecurringStatus, type RecurringTemplate,
} from "@/db/schema";
import { audit } from "../audit";
import { todayTunis } from "../dates";
import { ServiceError, type Actor } from "../errors";
import { sendInvoiceEmail } from "../mail/documents";
import { getMailTransport, type MailTransport } from "../mail/transport";
import { optText, optUuid } from "../validation";
import {
  createDraftInvoiceTx, dateString, invoiceInputSchema, invoiceLineSchema, loadContext, resolveLines, validateDocumentTx,
  type Tx,
} from "./invoices";

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Date de la période n, calculée depuis la date de départ (jamais depuis la période précédente) :
 * le jour d'ancrage est conservé et ramené à la fin du mois si besoin (31 janvier -> 28 février -> 31 mars).
 */
export function addPeriods(start: string, frequency: RecurringFrequency, n: number): string {
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  if (frequency === "weekly") return new Date(Date.UTC(y, m - 1, d + 7 * n)).toISOString().slice(0, 10);
  const months = n * (frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12);
  const total = m - 1 + months;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ny, nm, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: "Chaque semaine", monthly: "Chaque mois", quarterly: "Chaque trimestre", yearly: "Chaque année",
};

/** Plafond de périodes rattrapées en une exécution (arrêt prolongé du planificateur). */
export const MAX_CATCH_UP = 12;

// ---------------------------------------------------------------------------
// Modèles
// ---------------------------------------------------------------------------

export const recurringInputSchema = z
  .object({
    name: z.string().trim().min(1, "Nom du modèle requis").max(120),
    customerId: z.string().uuid("Choisissez un client"),
    frequency: z.enum(RECURRING_FREQUENCIES),
    startDate: dateString,
    endDate: z.union([z.literal(""), dateString]).optional().transform((v) => v || null),
    autoValidate: z.boolean().default(false),
    autoSend: z.boolean().default(false),
    paymentTermId: optUuid,
    reference: optText(100),
    notes: optText(2000),
    lines: z.array(invoiceLineSchema).min(1, "Ajoutez au moins une ligne").max(200, "200 lignes maximum"),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: "La fin ne peut pas précéder le début", path: ["endDate"] })
  .refine((v) => !v.autoSend || v.autoValidate, { message: "L'envoi automatique exige la validation automatique", path: ["autoSend"] });
export type RecurringInput = z.input<typeof recurringInputSchema>;

async function checkTemplate(tx: Tx, data: z.output<typeof recurringInputSchema>) {
  const ctx = await loadContext(tx, data.customerId);
  if (!ctx.customer.isActive) throw new ServiceError("Ce client est désactivé");
  // Les taux et le FODEC doivent être valides dès maintenant ; ils sont revérifiés à chaque génération.
  await resolveLines(tx, data.lines, ctx.vatExempt, new Set());
}

const lineValues = (templateId: string, lines: z.output<typeof recurringInputSchema>["lines"]) =>
  lines.map((l, i) => ({
    templateId, position: i + 1, productId: l.productId, description: l.description, quantity: l.quantity,
    unit: l.unit, unitPrice: l.unitPrice, discountPercent: l.discountPercent, tvaRateId: l.tvaRateId,
    fodecApplicable: l.fodecApplicable,
  }));

export async function createRecurringTemplate(db: Db, actor: Actor, input: RecurringInput): Promise<RecurringTemplate> {
  const data = recurringInputSchema.parse(input);
  return db.transaction(async (tx) => {
    await checkTemplate(tx, data);
    const { lines, ...header } = data;
    const [created] = await tx
      .insert(recurringTemplates)
      .values({ ...header, nextRunDate: data.startDate, createdBy: actor.id })
      .returning();
    if (!created) throw new Error("Insertion du modèle échouée");
    await tx.insert(recurringTemplateLines).values(lineValues(created.id, lines));
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "recurring.create", entity: "recurring_template", entityId: created.id, after: { ...created, lineCount: lines.length },
    });
    return created;
  });
}

export async function updateRecurringTemplate(db: Db, actor: Actor, id: string, input: RecurringInput): Promise<RecurringTemplate> {
  const data = recurringInputSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(recurringTemplates).where(eq(recurringTemplates.id, id)).for("update");
    if (!before) throw new ServiceError("Modèle introuvable");
    if (before.status === "ended") throw new ServiceError("Ce modèle est terminé : créez-en un nouveau");
    if (before.runIndex > 0 && (data.startDate !== before.startDate || data.frequency !== before.frequency)) {
      throw new ServiceError("La date de début et la fréquence ne peuvent plus changer : des périodes ont déjà été traitées");
    }
    await checkTemplate(tx, data);
    const { lines, ...header } = data;
    await tx.delete(recurringTemplateLines).where(eq(recurringTemplateLines.templateId, id));
    const [after] = await tx
      .update(recurringTemplates)
      .set({
        ...header, customerId: before.runIndex > 0 ? before.customerId : header.customerId,
        nextRunDate: addPeriods(header.startDate, header.frequency, before.runIndex), updatedAt: new Date(),
      })
      .where(eq(recurringTemplates.id, id))
      .returning();
    if (!after) throw new Error("Mise à jour du modèle échouée");
    await tx.insert(recurringTemplateLines).values(lineValues(id, lines));
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "recurring.update", entity: "recurring_template", entityId: id, before, after: { ...after, lineCount: lines.length },
    });
    return after;
  });
}

export async function setRecurringStatus(db: Db, actor: Actor, id: string, status: Exclude<RecurringStatus, "ended"> | "ended") {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(recurringTemplates).where(eq(recurringTemplates.id, id)).for("update");
    if (!before) throw new ServiceError("Modèle introuvable");
    if (before.status === "ended") throw new ServiceError("Ce modèle est terminé");
    const [after] = await tx.update(recurringTemplates).set({ status, updatedAt: new Date() }).where(eq(recurringTemplates.id, id)).returning();
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: `recurring.${status}`, entity: "recurring_template", entityId: id, before: { status: before.status }, after: { status },
    });
    return after!;
  });
}

/** Un modèle qui n'a jamais généré de facture peut être supprimé ; sinon on le termine (l'historique reste). */
export async function deleteRecurringTemplate(db: Db, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(recurringTemplates).where(eq(recurringTemplates.id, id)).for("update");
    if (!before) throw new ServiceError("Modèle introuvable");
    const [run] = await tx.select({ id: recurringRuns.id }).from(recurringRuns).where(eq(recurringRuns.templateId, id)).limit(1);
    if (run) throw new ServiceError("Ce modèle a un historique de génération : terminez-le au lieu de le supprimer");
    await tx.delete(recurringTemplates).where(eq(recurringTemplates.id, id));
    await audit(tx, { userId: actor.id, userEmail: actor.email, ip: actor.ip, action: "recurring.delete", entity: "recurring_template", entityId: id, before });
  });
}

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------

export type RecurringOutcome =
  | { kind: "generated"; templateId: string; templateName: string; scheduledDate: string; invoiceId: string; invoiceNumber: string | null; validated: boolean; email: string | null }
  | { kind: "failed"; templateId: string; templateName: string; scheduledDate: string; error: string };

/** Génère UNE période dans une transaction : facture (et validation) + historique + avancement du modèle, ou rien. */
async function generateOne(db: Db, templateId: string, today: string): Promise<RecurringOutcome | null> {
  const attempt: { period: number; scheduled: string; name: string } = { period: -1, scheduled: "", name: "" };
  try {
    const result = await db.transaction(async (tx) => {
      const [tpl] = await tx.select().from(recurringTemplates).where(eq(recurringTemplates.id, templateId)).for("update");
      if (!tpl || tpl.status !== "active") return null;
      const scheduled = addPeriods(tpl.startDate, tpl.frequency, tpl.runIndex);
      Object.assign(attempt, { period: tpl.runIndex, scheduled, name: tpl.name });
      if (tpl.endDate && scheduled > tpl.endDate) {
        await tx.update(recurringTemplates).set({ status: "ended", updatedAt: new Date() }).where(eq(recurringTemplates.id, templateId));
        return null;
      }
      if (scheduled > today) return null;

      const lines = await tx.select().from(recurringTemplateLines).where(eq(recurringTemplateLines.templateId, templateId)).orderBy(asc(recurringTemplateLines.position));
      // Une facture validée doit respecter l'ordre chronologique des numéros : on ne recule jamais avant la dernière.
      let issueDate = scheduled;
      if (tpl.autoValidate) {
        const [latest] = await tx
          .select({ d: sql<string | null>`max(${invoices.issueDate})::text` })
          .from(invoices)
          .where(and(eq(invoices.kind, "invoice"), eq(invoices.status, "validated")));
        if (latest?.d && latest.d > issueDate) issueDate = latest.d;
      }
      const actor: Actor = { id: tpl.createdBy, email: "système (récurrence)" };
      // Passe par le schéma de saisie : "" devient null, montants normalisés, exactement comme pour une saisie manuelle.
      const input = invoiceInputSchema.parse({
        customerId: tpl.customerId, issueDate, dueDate: "", paymentTermId: tpl.paymentTermId ?? "",
        reference: tpl.reference ?? `${tpl.name} — ${scheduled.slice(0, 7)}`, notes: tpl.notes ?? "",
        lines: lines.map((l) => ({
          productId: l.productId ?? "", description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
          discountPercent: l.discountPercent, tvaRateId: l.tvaRateId, fodecApplicable: l.fodecApplicable,
        })),
      });
      const draft = await createDraftInvoiceTx(tx, actor, input);
      const invoice = tpl.autoValidate ? await validateDocumentTx(tx, actor, draft.id) : draft;

      await tx.insert(recurringRuns).values({
        templateId, periodIndex: tpl.runIndex, scheduledDate: scheduled, status: "generated", invoiceId: invoice.id,
      });
      const next = addPeriods(tpl.startDate, tpl.frequency, tpl.runIndex + 1);
      const ended = !!tpl.endDate && next > tpl.endDate;
      await tx.update(recurringTemplates)
        .set({ runIndex: tpl.runIndex + 1, nextRunDate: next, status: ended ? "ended" : "active", updatedAt: new Date() })
        .where(eq(recurringTemplates.id, templateId));
      await audit(tx, {
        userId: actor.id, userEmail: actor.email, action: "recurring.generate", entity: "recurring_template", entityId: templateId,
        after: { invoiceId: invoice.id, number: invoice.number, scheduled, validated: tpl.autoValidate },
      });
      return { tpl, invoice, scheduled, actor };
    });
    if (!result) return null;
    return {
      kind: "generated", templateId, templateName: result.tpl.name, scheduledDate: result.scheduled,
      invoiceId: result.invoice.id, invoiceNumber: result.invoice.number, validated: result.tpl.autoValidate,
      email: null,
    } satisfies RecurringOutcome;
  } catch (e) {
    if (attempt.period < 0) throw e;
    // La transaction est annulée (aucune facture, aucun numéro consommé) : on garde seulement la trace de l'échec.
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await db.insert(recurringRuns).values({
      templateId, periodIndex: attempt.period, scheduledDate: attempt.scheduled, status: "failed", error,
    });
    return { kind: "failed", templateId, templateName: attempt.name, scheduledDate: attempt.scheduled, error };
  }
}

export type RecurringRunSummary = { generated: Extract<RecurringOutcome, { kind: "generated" }>[]; failed: Extract<RecurringOutcome, { kind: "failed" }>[] };

/**
 * Génère toutes les factures récurrentes échues à `today` (rattrapage plafonné à MAX_CATCH_UP périodes par modèle).
 * Idempotent : relançable sans doublon. Un échec est journalisé et retenté à l'exécution suivante.
 */
export async function runRecurring(
  db: Db, opts: { today?: string; transport?: MailTransport; templateId?: string } = {},
): Promise<RecurringRunSummary> {
  const today = opts.today ?? todayTunis();
  const summary: RecurringRunSummary = { generated: [], failed: [] };

  const due = await db
    .select({ id: recurringTemplates.id })
    .from(recurringTemplates)
    .where(and(
      eq(recurringTemplates.status, "active"), lte(recurringTemplates.nextRunDate, today),
      opts.templateId ? eq(recurringTemplates.id, opts.templateId) : undefined,
    ))
    .orderBy(asc(recurringTemplates.nextRunDate));

  for (const { id } of due) {
    for (let i = 0; i < MAX_CATCH_UP; i++) {
      const outcome = await generateOne(db, id, today);
      if (!outcome) break;
      if (outcome.kind === "failed") { summary.failed.push(outcome); break; }
      summary.generated.push(outcome);
    }
  }

  // Envoi par e-mail APRÈS validation de chaque transaction : un échec d'envoi n'annule jamais une facture.
  for (const g of summary.generated) {
    if (!g.validated) continue;
    const [tpl] = await db.select().from(recurringTemplates).where(eq(recurringTemplates.id, g.templateId));
    if (!tpl?.autoSend) continue;
    let emailStatus = "sent";
    let emailError: string | null = null;
    try {
      const { log } = await sendInvoiceEmail(db, { id: tpl.createdBy, email: "système (récurrence)" }, g.invoiceId, {}, opts.transport ?? getMailTransport());
      g.email = log.toEmail;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      emailStatus = /adresse e-mail/i.test(message) ? "skipped" : "failed";
      emailError = message.slice(0, 500);
    }
    await db.update(recurringRuns).set({ emailStatus, emailError })
      .where(and(eq(recurringRuns.templateId, g.templateId), eq(recurringRuns.invoiceId, g.invoiceId)));
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function getRecurringTemplate(db: Db, id: string) {
  const [template] = await db.select().from(recurringTemplates).where(eq(recurringTemplates.id, id));
  if (!template) return null;
  const [lines, [customer], runs] = await Promise.all([
    db.select().from(recurringTemplateLines).where(eq(recurringTemplateLines.templateId, id)).orderBy(asc(recurringTemplateLines.position)),
    db.select().from(customers).where(eq(customers.id, template.customerId)),
    db
      .select({ run: recurringRuns, number: invoices.number, invoiceStatus: invoices.status })
      .from(recurringRuns)
      .leftJoin(invoices, eq(invoices.id, recurringRuns.invoiceId))
      .where(eq(recurringRuns.templateId, id))
      .orderBy(desc(recurringRuns.createdAt))
      .limit(50),
  ]);
  const upcoming: string[] = [];
  if (template.status !== "ended") {
    for (let i = 0; i < 6; i++) {
      const d = addPeriods(template.startDate, template.frequency, template.runIndex + i);
      if (template.endDate && d > template.endDate) break;
      upcoming.push(d);
    }
  }
  return { template, lines, customer: customer ?? null, runs, upcoming };
}

export async function listRecurringTemplates(db: Db, opts: { status?: RecurringStatus; q?: string } = {}) {
  const like = opts.q?.trim() ? `%${opts.q.trim().replace(/[\\%_]/g, "\\$&")}%` : null;
  return db
    .select({ template: recurringTemplates, customerName: customers.name })
    .from(recurringTemplates)
    .innerJoin(customers, eq(customers.id, recurringTemplates.customerId))
    .where(and(
      opts.status ? eq(recurringTemplates.status, opts.status) : undefined,
      like ? ilike(recurringTemplates.name, like) : undefined,
    ))
    .orderBy(asc(recurringTemplates.nextRunDate), asc(recurringTemplates.name));
}
