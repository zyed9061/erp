import { and, asc, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import { customerContacts, customers, emailLog, type EmailLogEntry } from "@/db/schema";
import { audit } from "../audit";
import { ServiceError, type Actor } from "../errors";
import { getCompany } from "../company";
import { getInvoice } from "../invoicing/invoices";
import { getQuote } from "../invoicing/quotes";
import { formatTnd } from "../money";
import { loadInvoicePdf, loadQuotePdf } from "../pdf/loaders";
import { renderDocumentPdf } from "../pdf/render";
import { getMailTransport, type MailAttachment, type MailTransport } from "./transport";

const emailSchema = z.string().trim().max(200).email("Adresse e-mail invalide");
const messageSchema = z.string().trim().max(2000).optional().transform((v) => v || null);

/** Un seul saut de ligne par champ d'en-tête : neutralise toute injection d'en-têtes dans le sujet. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim().slice(0, 200);

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function textToHtml(text: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#12162b">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
}

/** Destinataire par défaut d'un client : contact de facturation, sinon e-mail de la fiche. */
export async function defaultRecipient(db: Pick<Db, "select">, customerId: string): Promise<string | null> {
  const contacts = await db
    .select()
    .from(customerContacts)
    .where(eq(customerContacts.customerId, customerId))
    .orderBy(asc(customerContacts.name));
  const billing = contacts.find((c) => c.isBilling && c.email) ?? contacts.find((c) => c.email);
  if (billing?.email) return billing.email;
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  return customer?.email ?? null;
}

type Target = { kind: "invoice" | "quote" | "reminder"; invoiceId?: string; quoteId?: string };

/**
 * Envoie un message et journalise le résultat (réussi ou non). Le journal est écrit HORS de toute transaction
 * métier : un échec d'envoi laisse une trace « failed » sans annuler quoi que ce soit.
 */
export async function deliver(
  db: Db,
  actor: Actor | null,
  transport: MailTransport,
  target: Target,
  message: { to: string; subject: string; text: string; attachment: MailAttachment },
): Promise<{ log: EmailLogEntry }> {
  const subject = oneLine(message.subject);
  let messageId: string | null = null;
  let error: string | null = null;
  try {
    ({ messageId } = await transport.send({
      to: message.to, subject, text: message.text, html: textToHtml(message.text), attachments: [message.attachment],
    }));
  } catch (e) {
    error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
  }
  const [log] = await db
    .insert(emailLog)
    .values({
      kind: target.kind, invoiceId: target.invoiceId ?? null, quoteId: target.quoteId ?? null,
      toEmail: message.to, subject, status: error ? "failed" : "sent", error, messageId,
      attachmentName: message.attachment.filename, createdBy: actor?.id ?? null,
    })
    .returning();
  if (!log) throw new Error("Journal d'envoi indisponible");
  await audit(db, {
    userId: actor?.id ?? null, userEmail: actor?.email ?? "système", ip: actor?.ip,
    action: error ? "email.failed" : "email.sent", entity: target.invoiceId ? "invoice" : "quote",
    entityId: (target.invoiceId ?? target.quoteId)!, after: { kind: target.kind, to: message.to, subject, error },
  });
  if (error) throw new ServiceError(`Échec de l'envoi : ${error}`);
  return { log };
}

/** Refuse un second envoi identique dans la minute (double clic, nouvelle tentative réseau). */
async function assertNotJustSent(db: Db, target: Target, to: string) {
  const since = new Date(Date.now() - 60_000);
  const [recent] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(and(
      target.invoiceId ? eq(emailLog.invoiceId, target.invoiceId) : eq(emailLog.quoteId, target.quoteId!),
      eq(emailLog.kind, target.kind), eq(emailLog.toEmail, to), eq(emailLog.status, "sent"),
      gt(emailLog.createdAt, since),
    ))
    .limit(1);
  if (recent) throw new ServiceError("Ce document vient d'être envoyé à cette adresse : patientez une minute avant de le renvoyer");
}

const KIND_NOUN = { invoice: "facture", credit_note: "avoir", deposit_invoice: "facture d'acompte" } as const;

export const sendInput = z.object({ to: emailSchema.optional(), message: messageSchema });
export type SendInput = z.input<typeof sendInput>;

export async function sendInvoiceEmail(
  db: Db, actor: Actor, invoiceId: string, input: SendInput = {}, transport: MailTransport = getMailTransport(),
) {
  const data = sendInput.parse(input);
  const details = await getInvoice(db, invoiceId);
  if (!details) throw new ServiceError("Document introuvable");
  const inv = details.invoice;
  if (inv.status !== "validated") throw new ServiceError("Validez le document avant de l'envoyer");

  const to = data.to ?? (await defaultRecipient(db, inv.customerId));
  if (!to) throw new ServiceError("Aucune adresse e-mail : saisissez un destinataire ou renseignez le client");
  const target: Target = { kind: "invoice", invoiceId };
  await assertNotJustSent(db, target, to);

  const company = await getCompany(db);
  const noun = KIND_NOUN[inv.kind];
  const loaded = (await loadInvoicePdf(db, invoiceId))!;
  const pdf = await renderDocumentPdf(loaded.data);
  const amountLine = inv.kind === "credit_note"
    ? `d'un montant de ${formatTnd(inv.netToPay)}`
    : `d'un net à payer de ${formatTnd(inv.netToPay)}${inv.dueDate ? `, à régler avant le ${inv.dueDate.split("-").reverse().join("/")}` : ""}`;
  const snapshot = (inv.companySnapshot as { legalName?: string } | null) ?? {};
  const text = [
    "Bonjour,",
    "",
    `Veuillez trouver ci-joint ${noun === "avoir" ? "l'" : "la "}${noun} N° ${inv.number} ${amountLine}.`,
    ...(data.message ? ["", data.message] : []),
    "",
    "Cordialement,",
    snapshot.legalName ?? company.legalName,
  ].join("\n");

  return deliver(db, actor, transport, target, {
    to, subject: `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${inv.number} — ${snapshot.legalName ?? company.legalName}`, text,
    attachment: { filename: loaded.filename, content: pdf, contentType: "application/pdf" },
  });
}

export async function sendQuoteEmail(
  db: Db, actor: Actor, quoteId: string, input: SendInput = {}, transport: MailTransport = getMailTransport(),
) {
  const data = sendInput.parse(input);
  const details = await getQuote(db, quoteId);
  if (!details) throw new ServiceError("Devis introuvable");
  const q = details.quote;
  if (q.status === "draft") throw new ServiceError("Envoyez (numérotez) le devis avant de le transmettre par e-mail");

  const to = data.to ?? (await defaultRecipient(db, q.customerId));
  if (!to) throw new ServiceError("Aucune adresse e-mail : saisissez un destinataire ou renseignez le client");
  const target: Target = { kind: "quote", quoteId };
  await assertNotJustSent(db, target, to);

  const company = await getCompany(db);
  const loaded = (await loadQuotePdf(db, quoteId))!;
  const pdf = await renderDocumentPdf(loaded.data);
  const text = [
    "Bonjour,",
    "",
    `Veuillez trouver ci-joint notre devis N° ${q.number} d'un montant de ${formatTnd(q.totalTtc)} TTC${q.validUntil ? `, valable jusqu'au ${q.validUntil.split("-").reverse().join("/")}` : ""}.`,
    ...(data.message ? ["", data.message] : []),
    "",
    "Cordialement,",
    company.legalName,
  ].join("\n");

  return deliver(db, actor, transport, target, {
    to, subject: `Devis ${q.number} — ${company.legalName}`, text,
    attachment: { filename: loaded.filename, content: pdf, contentType: "application/pdf" },
  });
}

export async function emailHistory(db: Db, target: { invoiceId?: string; quoteId?: string }) {
  return db
    .select()
    .from(emailLog)
    .where(target.invoiceId ? eq(emailLog.invoiceId, target.invoiceId) : eq(emailLog.quoteId, target.quoteId!))
    .orderBy(desc(emailLog.createdAt));
}
