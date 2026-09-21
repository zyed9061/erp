import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import {
  customers, invoiceBalances, invoices, reminderRules, reminders, type ReminderRule,
} from "@/db/schema";
import { audit } from "../audit";
import { todayTunis } from "../dates";
import { ServiceError, type Actor } from "../errors";
import { getCompany } from "../company";
import { deliver } from "../mail/documents";
import { defaultRecipient } from "../mail/documents";
import { getMailTransport, type MailTransport } from "../mail/transport";
import { formatAmount, fromMilli, toMilli } from "../money";
import { loadInvoicePdf } from "../pdf/loaders";
import { renderDocumentPdf } from "../pdf/render";

// ---------------------------------------------------------------------------
// Modèles
// ---------------------------------------------------------------------------

export const ruleSchema = z.object({
  daysAfterDue: z.coerce.number().int("Nombre de jours entier").min(1, "Au moins 1 jour").max(365, "365 jours maximum"),
  subject: z.string().trim().min(1, "Objet requis").max(200),
  body: z.string().trim().min(1, "Message requis").max(4000),
  isActive: z.boolean(),
});

export async function listReminderRules(db: Pick<Db, "select">): Promise<ReminderRule[]> {
  return db.select().from(reminderRules).orderBy(asc(reminderRules.level));
}

/** Les délais doivent croître avec le niveau (7 j < 15 j < 30 j) parmi les modèles actifs. */
export async function updateReminderRule(
  db: Db, actor: Actor, level: number, input: z.input<typeof ruleSchema>,
): Promise<ReminderRule> {
  const data = ruleSchema.parse(input);
  return db.transaction(async (tx) => {
    const rules = await tx.select().from(reminderRules).orderBy(asc(reminderRules.level)).for("update");
    const before = rules.find((r) => r.level === level);
    if (!before) throw new ServiceError("Modèle de relance introuvable");
    const next = rules.map((r) => (r.level === level ? { ...r, ...data } : r)).filter((r) => r.isActive);
    for (let i = 1; i < next.length; i++) {
      if (next[i]!.daysAfterDue <= next[i - 1]!.daysAfterDue) {
        throw new ServiceError("Les délais doivent augmenter d'un niveau à l'autre (ex. 7, 15, 30 jours)");
      }
    }
    const [after] = await tx.update(reminderRules).set(data).where(eq(reminderRules.level, level)).returning();
    if (!after) throw new Error("Mise à jour du modèle échouée");
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: "reminder_rule.update", entity: "reminder_rule", entityId: String(level), before, after,
    });
    return after;
  });
}

/** Remplace {{variable}} ; une variable inconnue devient vide (jamais d'évaluation de code). */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, name: string) => vars[name] ?? "");
}

export function daysBetween(fromDate: string, toDate: string): number {
  const ms = Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

const longDate = new Intl.DateTimeFormat("fr-TN", { dateStyle: "long", timeZone: "UTC" });

// ---------------------------------------------------------------------------
// Détection
// ---------------------------------------------------------------------------

export type OverdueInvoice = {
  invoiceId: string;
  number: string;
  customerId: string;
  customerName: string;
  dueDate: string;
  daysLate: number;
  due: string;
  /** Niveau à envoyer maintenant (le plus élevé atteint et pas encore envoyé), sinon null. */
  candidateLevel: number | null;
  lastLevel: number | null;
  lastSentAt: Date | null;
};

/** Toutes les factures échues avec un reste dû, et la relance qu'il convient d'envoyer à `today`. */
export async function overdueInvoices(db: Db, today: string = todayTunis()): Promise<OverdueInvoice[]> {
  const rows = await db
    .select({
      inv: invoices, customerName: customers.name,
      netToPay: invoiceBalances.netToPay, credited: invoiceBalances.credited, paid: invoiceBalances.paid,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .innerJoin(invoiceBalances, eq(invoiceBalances.invoiceId, invoices.id))
    .where(and(
      lt(invoices.dueDate, today),
      sql`(${invoiceBalances.netToPay} - ${invoiceBalances.credited} - ${invoiceBalances.paid}) > 0`,
    ))
    .orderBy(asc(invoices.dueDate), asc(invoices.number));
  if (rows.length === 0) return [];

  const rules = (await listReminderRules(db)).filter((r) => r.isActive);
  const history = await db
    .select()
    .from(reminders)
    .where(and(inArray(reminders.invoiceId, rows.map((r) => r.inv.id)), sql`${reminders.status} <> 'failed'`))
    .orderBy(desc(reminders.level));

  return rows.map(({ inv, customerName, netToPay, credited, paid }) => {
    const daysLate = daysBetween(inv.dueDate!, today);
    const mine = history.filter((h) => h.invoiceId === inv.id);
    const lastLevel = mine[0]?.level ?? null;
    const eligible = rules.filter((r) => r.daysAfterDue <= daysLate);
    const top = eligible.length ? Math.max(...eligible.map((r) => r.level)) : null;
    return {
      invoiceId: inv.id, number: inv.number ?? "", customerId: inv.customerId, customerName,
      dueDate: inv.dueDate!, daysLate,
      due: fromMilli(toMilli(netToPay ?? "0") - toMilli(credited ?? "0") - toMilli(paid ?? "0")),
      candidateLevel: top !== null && (lastLevel === null || top > lastLevel) ? top : null,
      lastLevel, lastSentAt: mine[0]?.sentAt ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string }; message?: string };
  return err?.code === "23505" || err?.cause?.code === "23505" || /duplicate key|reminders_active_uq/.test(err?.message ?? "");
};

/**
 * Envoie une relance pour une facture et un niveau. Le niveau est d'abord « réservé » (ligne pending protégée
 * par un index unique) : deux exécutions simultanées ne peuvent donc pas envoyer deux fois le même rappel.
 */
export async function sendReminder(
  db: Db,
  actor: Actor | null,
  p: { invoiceId: string; level: number; method: "auto" | "manual"; transport?: MailTransport; today?: string },
) {
  const transport = p.transport ?? getMailTransport();
  const today = p.today ?? todayTunis();

  const [row] = await db
    .select({
      inv: invoices, netToPay: invoiceBalances.netToPay, credited: invoiceBalances.credited, paid: invoiceBalances.paid,
    })
    .from(invoices)
    .innerJoin(invoiceBalances, eq(invoiceBalances.invoiceId, invoices.id))
    .where(eq(invoices.id, p.invoiceId));
  if (!row) throw new ServiceError("Facture validée introuvable");
  const inv = row.inv;
  const due = toMilli(row.netToPay ?? "0") - toMilli(row.credited ?? "0") - toMilli(row.paid ?? "0");
  if (due <= 0n) throw new ServiceError("Cette facture n'a plus de solde à payer");

  const [rule] = await db.select().from(reminderRules).where(eq(reminderRules.level, p.level));
  if (!rule || !rule.isActive) throw new ServiceError("Modèle de relance introuvable ou inactif");

  const [sentAlready] = await db
    .select({ level: reminders.level })
    .from(reminders)
    .where(and(eq(reminders.invoiceId, p.invoiceId), sql`${reminders.status} <> 'failed'`, sql`${reminders.level} >= ${p.level}`))
    .limit(1);
  if (sentAlready) throw new ServiceError("Une relance de ce niveau (ou d'un niveau supérieur) a déjà été envoyée");

  const to = await defaultRecipient(db, inv.customerId);
  if (!to) throw new ServiceError("Aucune adresse e-mail pour ce client");

  // Réservation du niveau.
  let claim;
  try {
    [claim] = await db
      .insert(reminders)
      .values({ invoiceId: p.invoiceId, level: p.level, toEmail: to, method: p.method, createdBy: actor?.id ?? null })
      .returning();
  } catch (e) {
    if (isUniqueViolation(e)) throw new ServiceError("Cette relance est déjà envoyée ou en cours d'envoi");
    throw e;
  }
  if (!claim) throw new Error("Réservation de la relance échouée");

  try {
    const company = await getCompany(db);
    const customerName = ((inv.customerSnapshot as { name?: string } | null)?.name) ?? "";
    const societe = ((inv.companySnapshot as { legalName?: string } | null)?.legalName) ?? company.legalName;
    const vars = {
      numero: inv.number ?? "", client: customerName, echeance: longDate.format(new Date(`${inv.dueDate}T00:00:00Z`)),
      reste_du: formatAmount(fromMilli(due)).replace(/ /g, " "), jours_retard: String(Math.max(0, daysBetween(inv.dueDate!, today))),
      societe,
    };
    const loaded = (await loadInvoicePdf(db, p.invoiceId))!;
    const pdf = await renderDocumentPdf(loaded.data);
    const { log } = await deliver(db, actor, transport, { kind: "reminder", invoiceId: p.invoiceId }, {
      to, subject: renderTemplate(rule.subject, vars), text: renderTemplate(rule.body, vars),
      attachment: { filename: loaded.filename, content: pdf, contentType: "application/pdf" },
    });
    await db.update(reminders).set({ status: "sent", sentAt: new Date(), emailLogId: log.id }).where(eq(reminders.id, claim.id));
    await audit(db, {
      userId: actor?.id ?? null, userEmail: actor?.email ?? "système", ip: actor?.ip,
      action: "reminder.sent", entity: "invoice", entityId: p.invoiceId, after: { level: p.level, to, method: p.method },
    });
    return { to, level: p.level };
  } catch (e) {
    // L'échec reste réessayable : le niveau n'est plus réservé.
    await db.update(reminders).set({ status: "failed", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) })
      .where(eq(reminders.id, claim.id));
    throw e;
  }
}

/** Relance manuelle : le niveau à envoyer est le prochain dû ; `level` permet de forcer un niveau supérieur. */
export async function sendManualReminder(
  db: Db, actor: Actor, invoiceId: string, opts: { level?: number; transport?: MailTransport; today?: string } = {},
) {
  const today = opts.today ?? todayTunis();
  let level = opts.level;
  if (level === undefined) {
    const overdue = (await overdueInvoices(db, today)).find((o) => o.invoiceId === invoiceId);
    if (!overdue) throw new ServiceError("Cette facture n'est pas en retard de paiement");
    if (overdue.candidateLevel === null) throw new ServiceError("Aucune relance due pour l'instant (dernier niveau atteint ou délai pas encore écoulé)");
    level = overdue.candidateLevel;
  }
  return sendReminder(db, actor, { invoiceId, level, method: "manual", transport: opts.transport, today });
}

export type ReminderRunSummary = {
  sent: { number: string; to: string; level: number }[];
  skipped: { number: string; reason: string }[];
  failed: { number: string; error: string }[];
};

/** Exécution automatique (cron) : envoie toutes les relances dues. Idempotente : relançable sans doublon. */
export async function runReminders(
  db: Db, opts: { today?: string; transport?: MailTransport; actor?: Actor | null } = {},
): Promise<ReminderRunSummary> {
  const today = opts.today ?? todayTunis();
  const transport = opts.transport ?? getMailTransport();
  const summary: ReminderRunSummary = { sent: [], skipped: [], failed: [] };

  // Une réservation restée « pending » depuis plus de 15 min (arrêt brutal) redevient réessayable.
  await db.update(reminders)
    .set({ status: "failed", error: "Délai dépassé (envoi interrompu)" })
    .where(and(eq(reminders.status, "pending"), sql`${reminders.claimedAt} < now() - interval '15 minutes'`));

  for (const o of (await overdueInvoices(db, today)).filter((x) => x.candidateLevel !== null)) {
    try {
      const r = await sendReminder(db, opts.actor ?? null, {
        invoiceId: o.invoiceId, level: o.candidateLevel!, method: "auto", transport, today,
      });
      summary.sent.push({ number: o.number, to: r.to, level: r.level });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof ServiceError && /adresse e-mail/.test(message)) summary.skipped.push({ number: o.number, reason: message });
      else summary.failed.push({ number: o.number, error: message });
    }
  }
  return summary;
}
