import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { emailLog, reminders } from "@/db/schema";
import type { Db } from "@/db/types";
import { updateCompany } from "@/lib/company";
import { addContact, createCustomer } from "@/lib/customers";
import { ServiceError } from "@/lib/errors";
import { createDraftInvoice, validateDocument, type InvoiceLineInput } from "@/lib/invoicing/invoices";
import { recordPayment } from "@/lib/invoicing/payments";
import { createDraftQuote, sendQuote } from "@/lib/invoicing/quotes";
import {
  daysBetween, listReminderRules, overdueInvoices, renderTemplate, runReminders, sendManualReminder,
  sendReminder, updateReminderRule,
} from "@/lib/invoicing/reminders";
import { emailHistory, sendInvoiceEmail, sendQuoteEmail } from "@/lib/mail/documents";
import { MemoryTransport } from "@/lib/mail/memory";
import { LogTransport, createTransportFromEnv } from "@/lib/mail/transport";
import { listTaxRates } from "@/lib/taxes";
import { createUser } from "@/lib/users";
import { createTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;
let actor: { id: string; email: string };
let tvaId: string;
let beta: string; // e-mail sur la fiche
let gamma: string; // contact de facturation, pas d'e-mail sur la fiche
let delta: string; // aucun e-mail

const line = (over: Partial<InvoiceLineInput> = {}): InvoiceLineInput => ({
  description: "Prestation", quantity: "1", unit: "unité", unitPrice: "100", discountPercent: "0", tvaRateId: tvaId, fodecApplicable: false, ...over,
});

/** Facture validée émise le 1er janvier 2026, échue à `dueDate`. */
async function invoice(customerId: string, dueDate: string, unitPrice = "100", issueDate = "2026-01-01") {
  const d = await createDraftInvoice(db, actor, { customerId, issueDate, dueDate, lines: [line({ unitPrice })] });
  return validateDocument(db, actor, d.id);
}
async function errorOf(p: Promise<unknown>) {
  return p.then(() => null, (e: Error & { cause?: Error }) => e);
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const user = await createUser(db, null, { email: "compta@example.tn", name: "Compta", role: "comptable", password: "Password-12345" });
  actor = { id: user.id, email: user.email };
  tvaId = (await listTaxRates(db)).find((r) => r.code === "TVA19")!.id;
  await updateCompany(db, actor, {
    legalName: "ACME SARL", matriculeFiscal: "7654321B/A/M/000", taxRegime: "reel", vatRegistered: true,
    stampDutyEnabled: true, stampDutyAmount: "1", withholdingBase: "ttc", withholdingThreshold: "0",
  });
  const mk = (name: string, mf: string, email?: string) =>
    createCustomer(db, actor, { type: "entreprise", name, matriculeFiscal: mf, taxStatus: "assujetti", email }).then((c) => c.id);
  beta = await mk("Beta SARL", "2222222/A/M/000", "compta@beta.tn");
  gamma = await mk("Gamma SA", "3333333/A/M/000");
  delta = await mk("Delta SARL", "4444444/A/M/000");
  await addContact(db, actor, gamma, { name: "Sami", email: "sami@gamma.tn", isBilling: true });
});
afterAll(() => close());

describe("transport", () => {
  it("n'envoie rien sans SMTP_HOST (mode journal) et exige un expéditeur avec SMTP", () => {
    expect(createTransportFromEnv({} as unknown as NodeJS.ProcessEnv)).toBeInstanceOf(LogTransport);
    expect(() => createTransportFromEnv({ SMTP_HOST: "smtp.example.tn" } as unknown as NodeJS.ProcessEnv)).toThrow(/MAIL_FROM/);
    expect(() => createTransportFromEnv({ SMTP_HOST: "smtp.example.tn", MAIL_FROM: "a@b.tn" } as unknown as NodeJS.ProcessEnv)).not.toThrow();
  });
});

describe("modèles de relance", () => {
  it("remplace les variables et ignore les inconnues", () => {
    expect(renderTemplate("Facture {{numero}} de {{ client }} : {{inconnue}}.", { numero: "FA-1", client: "Beta" })).toBe("Facture FA-1 de Beta : .");
  });
  it("calcule les jours de retard", () => {
    expect(daysBetween("2026-01-31", "2026-02-07")).toBe(7);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("2026-03-01", "2026-03-01")).toBe(0);
  });
  it("fournit trois modèles par défaut à 7, 15 et 30 jours", async () => {
    expect((await listReminderRules(db)).map((r) => [r.level, r.daysAfterDue])).toEqual([[1, 7], [2, 15], [3, 30]]);
  });
  it("exige des délais croissants et des champs valides", async () => {
    const r1 = (await listReminderRules(db))[0]!;
    const base = { subject: r1.subject, body: r1.body, isActive: true };
    expect(await errorOf(updateReminderRule(db, actor, 1, { ...base, daysAfterDue: 20 }))).toBeInstanceOf(ServiceError); // 20 > 15
    expect(await errorOf(updateReminderRule(db, actor, 1, { ...base, daysAfterDue: 0 }))).toBeInstanceOf(Error);
    expect(await errorOf(updateReminderRule(db, actor, 1, { ...base, subject: "", daysAfterDue: 7 }))).toBeInstanceOf(Error);
    expect((await updateReminderRule(db, actor, 1, { ...base, daysAfterDue: 5 })).daysAfterDue).toBe(5);
    await updateReminderRule(db, actor, 1, { ...base, daysAfterDue: 7 });
  });
});

describe("envoi d'une facture par e-mail", () => {
  it("refuse un brouillon", async () => {
    const draft = await createDraftInvoice(db, actor, { customerId: beta, issueDate: "2026-01-01", lines: [line()] });
    expect(await errorOf(sendInvoiceEmail(db, actor, draft.id, {}, new MemoryTransport()))).toBeInstanceOf(ServiceError);
  });

  it("envoie le PDF au contact de facturation (sinon à l'e-mail du client), et journalise", async () => {
    const t = new MemoryTransport();
    const inv = await invoice(beta, "2026-02-01", "100");
    const { log } = await sendInvoiceEmail(db, actor, inv.id, { message: "Merci de votre confiance." }, t);
    expect(t.sent).toHaveLength(1);
    const mail = t.sent[0]!;
    expect(mail.to).toBe("compta@beta.tn");
    expect(mail.subject).toBe(`Facture ${inv.number} — ACME SARL`);
    expect(mail.text).toContain(`facture N° ${inv.number}`);
    expect(mail.text).toContain("120,000 DT"); // 100 + 19 TVA + 1 timbre
    expect(mail.text).toContain("01/02/2026");
    expect(mail.text).toContain("Merci de votre confiance.");
    expect(mail.html).toContain("Merci de votre confiance.");
    expect(mail.attachments?.[0]).toMatchObject({ filename: `${inv.number}.pdf`, contentType: "application/pdf" });
    expect(Buffer.from(mail.attachments![0]!.content.slice(0, 5)).toString()).toBe("%PDF-");
    expect(log).toMatchObject({ kind: "invoice", status: "sent", toEmail: "compta@beta.tn", invoiceId: inv.id });

    // Le contact de facturation passe avant l'e-mail de la fiche client.
    const invG = await invoice(gamma, "2026-02-01");
    await sendInvoiceEmail(db, actor, invG.id, {}, t);
    expect(t.sent[1]!.to).toBe("sami@gamma.tn");
  });

  it("refuse un second envoi immédiat, une adresse invalide et l'absence de destinataire", async () => {
    const t = new MemoryTransport();
    const inv = await invoice(beta, "2026-02-01");
    await sendInvoiceEmail(db, actor, inv.id, {}, t);
    expect((await errorOf(sendInvoiceEmail(db, actor, inv.id, {}, t)))?.message).toMatch(/vient d'être envoyé/);
    expect(await errorOf(sendInvoiceEmail(db, actor, inv.id, { to: "autre@beta.tn" }, t))).toBeNull(); // autre adresse : permis
    expect(await errorOf(sendInvoiceEmail(db, actor, inv.id, { to: "pas-un-mail" }, t))).toBeInstanceOf(Error);
    const noMail = await invoice(delta, "2026-02-01");
    expect((await errorOf(sendInvoiceEmail(db, actor, noMail.id, {}, t)))?.message).toMatch(/Aucune adresse e-mail/);
    expect(t.sent).toHaveLength(2);
  });

  it("journalise un échec sans rien annuler, et permet de réessayer", async () => {
    const t = new MemoryTransport();
    const inv = await invoice(beta, "2026-02-01");
    t.failNext = "Connexion SMTP refusée";
    const err = await errorOf(sendInvoiceEmail(db, actor, inv.id, {}, t));
    expect(err).toBeInstanceOf(ServiceError);
    expect(err?.message).toMatch(/Connexion SMTP refusée/);
    const history = await emailHistory(db, { invoiceId: inv.id });
    expect(history.map((h) => h.status)).toEqual(["failed"]);
    expect(history[0]?.error).toBe("Connexion SMTP refusée");
    // Un échec ne bloque pas le renvoi (seuls les envois réussis comptent pour l'anti-doublon).
    await sendInvoiceEmail(db, actor, inv.id, {}, t);
    expect((await emailHistory(db, { invoiceId: inv.id })).map((h) => h.status).sort()).toEqual(["failed", "sent"]);
  });

  it("protège le sujet contre l'injection d'en-têtes", async () => {
    const t = new MemoryTransport();
    const evil = await createCustomer(db, actor, { type: "entreprise", name: "Evil\r\nBcc: x@y.tn", matriculeFiscal: "5555555/A/M/000", taxStatus: "assujetti", email: "evil@x.tn" });
    const inv = await invoice(evil.id, "2026-02-01");
    await sendInvoiceEmail(db, actor, inv.id, { message: "Ligne 1\nLigne 2 <b>gras</b>" }, t);
    expect(t.sent[0]!.subject).not.toMatch(/[\r\n]/);
    expect(t.sent[0]!.html).toContain("&lt;b&gt;gras&lt;/b&gt;"); // le HTML saisi est échappé
  });

  it("garde un journal d'envoi en ajout seul", async () => {
    const msg = async (q: ReturnType<typeof sql>) => {
      const e = await errorOf(db.execute(q));
      return `${e?.message} ${e?.cause?.message}`;
    };
    expect(await msg(sql`UPDATE email_log SET status = 'sent'`)).toMatch(/ajout seul/);
    expect(await msg(sql`DELETE FROM email_log`)).toMatch(/ajout seul/);
  });
});

describe("envoi d'un devis par e-mail", () => {
  it("refuse un brouillon puis envoie le devis numéroté", async () => {
    const t = new MemoryTransport();
    const draft = await createDraftQuote(db, actor, { customerId: beta, issueDate: "2026-01-01", validUntil: "2099-01-01", lines: [line({ unitPrice: "500" })] });
    expect(await errorOf(sendQuoteEmail(db, actor, draft.id, {}, t))).toBeInstanceOf(ServiceError);
    const q = await sendQuote(db, actor, draft.id);
    await sendQuoteEmail(db, actor, q.id, {}, t);
    expect(t.sent[0]).toMatchObject({ to: "compta@beta.tn", subject: `Devis ${q.number} — ACME SARL` });
    expect(t.sent[0]!.text).toContain("595,000 DT TTC");
    expect(t.sent[0]!.attachments?.[0]?.filename).toBe(`${q.number}.pdf`);
    expect((await db.select().from(emailLog).where(eq(emailLog.quoteId, q.id)))[0]?.kind).toBe("quote");
  });
});

describe("relances automatiques", () => {
  let due: Awaited<ReturnType<typeof invoice>>; // échue le 31/01/2026

  beforeAll(async () => {
    // Une base propre pour les relances : les factures des tests précédents sont neutralisées par un paiement.
    for (const row of await overdueInvoices(db, "2026-12-31")) {
      await recordPayment(db, actor, {
        customerId: row.customerId, paymentDate: "2026-02-01", amount: row.due, method: "virement",
        allocations: [{ invoiceId: row.invoiceId, amount: row.due }],
      });
    }
    due = await invoice(beta, "2026-01-31", "1000", "2026-01-02");
  });

  it("n'envoie rien avant le premier délai (7 jours)", async () => {
    const t = new MemoryTransport();
    const summary = await runReminders(db, { today: "2026-02-05", transport: t });
    expect(summary).toEqual({ sent: [], skipped: [], failed: [] });
    expect(t.sent).toHaveLength(0);
  });

  it("envoie le niveau 1 à J+7, avec le solde restant et le PDF de la facture", async () => {
    const t = new MemoryTransport();
    const summary = await runReminders(db, { today: "2026-02-07", transport: t });
    expect(summary.sent).toEqual([{ number: due.number, to: "compta@beta.tn", level: 1 }]);
    const mail = t.sent[0]!;
    expect(mail.subject).toBe(`Rappel : facture ${due.number} échue`);
    expect(mail.text).toContain("Beta SARL");
    expect(mail.text).toContain("31 janvier 2026");
    expect(mail.text).toContain("1 191,000"); // net à payer : 1000 + 190 TVA + 1 de timbre
    expect(mail.text).toContain("7 jours de retard");
    expect(mail.attachments?.[0]?.filename).toBe(`${due.number}.pdf`);
    expect((await db.select().from(emailLog).where(eq(emailLog.kind, "reminder"))).length).toBeGreaterThan(0);
  });

  it("est idempotente : relancer le même jour n'envoie plus rien", async () => {
    const t = new MemoryTransport();
    expect((await runReminders(db, { today: "2026-02-07", transport: t })).sent).toHaveLength(0);
    expect((await runReminders(db, { today: "2026-02-10", transport: t })).sent).toHaveLength(0);
    expect(t.sent).toHaveLength(0);
  });

  it("monte de niveau : niveau 2 à J+15, niveau 3 à J+30, puis plus rien", async () => {
    const t = new MemoryTransport();
    expect((await runReminders(db, { today: "2026-02-15", transport: t })).sent.map((s) => s.level)).toEqual([2]);
    expect(t.sent[0]!.subject).toMatch(/Deuxième rappel/);
    expect((await runReminders(db, { today: "2026-03-05", transport: t })).sent.map((s) => s.level)).toEqual([3]);
    expect(t.sent[1]!.subject).toMatch(/Dernier rappel/);
    expect((await runReminders(db, { today: "2026-06-01", transport: t })).sent).toHaveLength(0);
    const overview = (await overdueInvoices(db, "2026-06-01")).find((o) => o.invoiceId === due.id)!;
    expect(overview).toMatchObject({ lastLevel: 3, candidateLevel: null });
  });

  it("saute directement au niveau le plus élevé atteint, sans rattraper les niveaux manqués", async () => {
    const t = new MemoryTransport();
    const late = await invoice(beta, "2026-01-15", "50", "2026-01-03"); // à J+40 au 24/02
    const summary = await runReminders(db, { today: "2026-02-24", transport: t });
    expect(summary.sent.filter((s) => s.number === late.number).map((s) => s.level)).toEqual([3]);
    const levels = (await db.select().from(reminders).where(eq(reminders.invoiceId, late.id))).map((r) => r.level);
    expect(levels).toEqual([3]);
  });

  it("ne relance plus une facture payée, et réduit le montant réclamé après un paiement partiel", async () => {
    const t = new MemoryTransport();
    const inv = await invoice(beta, "2026-03-01", "1000", "2026-01-04");
    await recordPayment(db, actor, {
      customerId: beta, paymentDate: "2026-03-05", amount: "400", method: "virement", allocations: [{ invoiceId: inv.id, amount: "400" }],
    });
    await runReminders(db, { today: "2026-03-10", transport: t });
    const mail = t.sent.find((m) => m.subject.includes(inv.number!))!;
    expect(mail.text).toContain("791,000"); // 1191 − 400
    await recordPayment(db, actor, {
      customerId: beta, paymentDate: "2026-03-11", amount: "791", method: "virement", allocations: [{ invoiceId: inv.id, amount: "791" }],
    });
    expect((await runReminders(db, { today: "2026-04-15", transport: t })).sent.filter((s) => s.number === inv.number)).toHaveLength(0);
  });

  it("signale sans échouer un client sans adresse e-mail", async () => {
    const t = new MemoryTransport();
    const noMail = await invoice(delta, "2026-03-01", "80", "2026-01-05");
    const summary = await runReminders(db, { today: "2026-03-20", transport: t });
    expect(summary.skipped.map((s) => s.number)).toContain(noMail.number);
    expect(summary.failed).toEqual([]);
    expect(await db.select().from(reminders).where(eq(reminders.invoiceId, noMail.id))).toHaveLength(0);
  });

  it("garde une trace des échecs et réessaie à l'exécution suivante", async () => {
    const t = new MemoryTransport();
    const inv = await invoice(gamma, "2026-04-01", "60", "2026-01-06");
    t.failAlways = "Boîte pleine";
    const first = await runReminders(db, { today: "2026-04-10", transport: t });
    expect(first.failed.map((f) => f.number)).toContain(inv.number);
    const rows = await db.select().from(reminders).where(eq(reminders.invoiceId, inv.id));
    expect(rows.map((r) => r.status)).toEqual(["failed"]);
    expect(rows[0]?.error).toMatch(/Boîte pleine/);

    t.failAlways = null;
    const second = await runReminders(db, { today: "2026-04-10", transport: t });
    expect(second.sent.map((s) => s.number)).toContain(inv.number);
    expect((await db.select().from(reminders).where(eq(reminders.invoiceId, inv.id))).map((r) => r.status).sort()).toEqual(["failed", "sent"]);
  });

  it("empêche deux envois simultanés du même niveau", async () => {
    const t = new MemoryTransport();
    const inv = await invoice(beta, "2026-05-01", "30", "2026-01-07");
    const results = await Promise.allSettled([
      sendReminder(db, null, { invoiceId: inv.id, level: 1, method: "auto", transport: t, today: "2026-05-10" }),
      sendReminder(db, null, { invoiceId: inv.id, level: 1, method: "auto", transport: t, today: "2026-05-10" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(t.sent.filter((m) => m.subject.includes(inv.number!))).toHaveLength(1);
    const dup = await errorOf(db.insert(reminders).values({ invoiceId: inv.id, level: 1, toEmail: "x@y.tn", method: "auto" }));
    expect(`${dup?.message} ${dup?.cause?.message}`).toMatch(/reminders_active_uq|duplicate/);
  });

  it("reprend une réservation restée bloquée depuis plus de 15 minutes", async () => {
    const t = new MemoryTransport();
    const inv = await invoice(beta, "2026-06-01", "40", "2026-01-08");
    await db.insert(reminders).values({
      invoiceId: inv.id, level: 1, toEmail: "compta@beta.tn", method: "auto", status: "pending",
      claimedAt: new Date(Date.now() - 30 * 60_000),
    });
    const summary = await runReminders(db, { today: "2026-06-10", transport: t });
    expect(summary.sent.map((s) => s.number)).toContain(inv.number);
  });

  it("gère la relance manuelle : prochain niveau dû, refus si rien n'est dû ou si le niveau est déjà atteint", async () => {
    const t = new MemoryTransport();
    const inv = await invoice(beta, "2026-07-01", "20", "2026-01-09");
    expect((await errorOf(sendManualReminder(db, actor, inv.id, { today: "2026-06-20", transport: t })))?.message).toMatch(/pas en retard/);
    expect((await errorOf(sendManualReminder(db, actor, inv.id, { today: "2026-07-03", transport: t })))?.message).toMatch(/Aucune relance due/);
    const sent = await sendManualReminder(db, actor, inv.id, { today: "2026-07-09", transport: t });
    expect(sent.level).toBe(1);
    expect((await db.select().from(reminders).where(eq(reminders.invoiceId, inv.id)))[0]).toMatchObject({ method: "manual", createdBy: actor.id });
    expect(await errorOf(sendManualReminder(db, actor, inv.id, { today: "2026-07-09", transport: t }))).toBeInstanceOf(ServiceError);
    expect(await errorOf(sendManualReminder(db, actor, inv.id, { level: 1, today: "2026-07-20", transport: t }))).toBeInstanceOf(ServiceError);
    expect((await sendManualReminder(db, actor, inv.id, { level: 3, today: "2026-07-20", transport: t })).level).toBe(3); // forçage vers le haut
  });
});
