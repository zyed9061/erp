import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { invoices, recurringRuns, recurringTemplates } from "@/db/schema";
import type { Db } from "@/db/types";
import { updateCompany } from "@/lib/company";
import { createCustomer, setCustomerActive } from "@/lib/customers";
import { ServiceError } from "@/lib/errors";
import { createDraftInvoice, getInvoice, validateDocument, type InvoiceLineInput } from "@/lib/invoicing/invoices";
import {
  MAX_CATCH_UP, addPeriods, createRecurringTemplate, deleteRecurringTemplate, getRecurringTemplate,
  listRecurringTemplates, runRecurring, setRecurringStatus, updateRecurringTemplate, type RecurringInput,
} from "@/lib/invoicing/recurring";
import { MemoryTransport } from "@/lib/mail/memory";
import { listTaxRates, updateTaxRate } from "@/lib/taxes";
import { createUser } from "@/lib/users";
import { createTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;
let actor: { id: string; email: string };
let tvaId: string;
let alpha: string; // e-mail
let noMail: string;

const line = (over: Partial<InvoiceLineInput> = {}): InvoiceLineInput => ({
  description: "Abonnement", quantity: "1", unit: "mois", unitPrice: "100", discountPercent: "0", tvaRateId: tvaId, fodecApplicable: false, ...over,
});
const tpl = (over: Partial<RecurringInput> = {}): RecurringInput => ({
  name: "Abonnement", customerId: alpha, frequency: "monthly", startDate: "2026-01-15", lines: [line()], ...over,
});
async function errorOf(p: Promise<unknown>) {
  return p.then(() => null, (e: Error & { cause?: Error }) => e);
}
const invoicesOf = (templateId: string) =>
  db.select({ inv: invoices }).from(recurringRuns).innerJoin(invoices, eq(invoices.id, recurringRuns.invoiceId)).where(eq(recurringRuns.templateId, templateId));

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
  alpha = await mk("Alpha SARL", "1111111/A/M/000", "compta@alpha.tn");
  noMail = await mk("Sans Mail SA", "2222222/A/M/000");
});
afterAll(() => close());

describe("calendrier", () => {
  it("ancre le jour du mois sans dérive (31 janvier -> 28 février -> 31 mars -> 30 avril)", () => {
    expect([0, 1, 2, 3].map((n) => addPeriods("2026-01-31", "monthly", n))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(addPeriods("2028-01-31", "monthly", 1)).toBe("2028-02-29"); // année bissextile
  });
  it("gère trimestres, années et semaines", () => {
    expect(addPeriods("2026-11-30", "quarterly", 1)).toBe("2027-02-28");
    expect(addPeriods("2026-11-30", "quarterly", 4)).toBe("2027-11-30");
    expect(addPeriods("2028-02-29", "yearly", 1)).toBe("2029-02-28");
    expect(addPeriods("2028-02-29", "yearly", 4)).toBe("2032-02-29");
    expect(addPeriods("2026-12-28", "weekly", 1)).toBe("2027-01-04");
    expect(addPeriods("2026-03-10", "monthly", 12)).toBe("2027-03-10");
    expect(addPeriods("2026-01-01", "monthly", 0)).toBe("2026-01-01");
  });
});

describe("modèles", () => {
  it("valide les saisies", async () => {
    await expect(createRecurringTemplate(db, actor, tpl({ lines: [] }))).rejects.toThrow();
    await expect(createRecurringTemplate(db, actor, tpl({ name: "" }))).rejects.toThrow();
    await expect(createRecurringTemplate(db, actor, tpl({ endDate: "2025-12-31" }))).rejects.toThrow(/fin/);
    await expect(createRecurringTemplate(db, actor, tpl({ autoSend: true, autoValidate: false }))).rejects.toThrow(/validation automatique/);
    await expect(createRecurringTemplate(db, actor, tpl({ startDate: "2026-02-30" }))).rejects.toThrow();
    await expect(createRecurringTemplate(db, actor, tpl({ lines: [line({ quantity: "0" })] }))).rejects.toThrow();
    const inactive = await createCustomer(db, actor, { type: "particulier", name: "Inactif", taxStatus: "non_assujetti" });
    await setCustomerActive(db, actor, inactive.id, false);
    expect(await errorOf(createRecurringTemplate(db, actor, tpl({ customerId: inactive.id })))).toBeInstanceOf(ServiceError);
  });

  it("crée un modèle actif dont la première échéance est la date de début", async () => {
    const t = await createRecurringTemplate(db, actor, tpl({ name: "Hébergement", startDate: "2027-01-31", endDate: "2027-03-31" }));
    expect(t).toMatchObject({ status: "active", runIndex: 0, nextRunDate: "2027-01-31", autoValidate: false });
    const d = (await getRecurringTemplate(db, t.id))!;
    expect(d.upcoming).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]); // s'arrête à la date de fin
    expect(d.lines).toHaveLength(1);
    expect((await listRecurringTemplates(db, { q: "Hébergement" })).map((r) => r.template.id)).toEqual([t.id]);
    await deleteRecurringTemplate(db, actor, t.id); // jamais utilisé : supprimable
    expect(await getRecurringTemplate(db, t.id)).toBeNull();
  });
});

describe("génération", () => {
  it("ne génère rien avant la première échéance, puis un brouillon à l'échéance, une seule fois", async () => {
    const t = await createRecurringTemplate(db, actor, tpl({ name: "Support" }));
    expect((await runRecurring(db, { today: "2026-01-14" })).generated).toHaveLength(0);

    const first = await runRecurring(db, { today: "2026-01-15" });
    expect(first.generated).toHaveLength(1);
    expect(first.generated[0]).toMatchObject({ templateName: "Support", scheduledDate: "2026-01-15", validated: false, invoiceNumber: null });
    const inv = (await getInvoice(db, first.generated[0]!.invoiceId))!.invoice;
    expect(inv).toMatchObject({ status: "draft", kind: "invoice", issueDate: "2026-01-15", totalHt: "100.000", totalTtc: "119.000", reference: "Support — 2026-01" });

    // Idempotent : le même jour, ou plus tard mais avant la période suivante, ne génère rien de plus.
    expect((await runRecurring(db, { today: "2026-01-15" })).generated).toHaveLength(0);
    expect((await runRecurring(db, { today: "2026-02-14" })).generated).toHaveLength(0);
    const after = (await db.select().from(recurringTemplates).where(eq(recurringTemplates.id, t.id)))[0]!;
    expect(after).toMatchObject({ runIndex: 1, nextRunDate: "2026-02-15" });
  });

  it("rattrape les périodes manquées dans l'ordre, avec la bonne date de chaque facture", async () => {
    const t = await createRecurringTemplate(db, actor, tpl({ name: "Rattrapage", startDate: "2026-01-31" }));
    const s = await runRecurring(db, { today: "2026-04-30", templateId: t.id });
    expect(s.generated.map((g) => g.scheduledDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect((await invoicesOf(t.id)).map((r) => r.inv.issueDate).sort()).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect((await getRecurringTemplate(db, t.id))!.template.nextRunDate).toBe("2026-05-31");
  });

  it("plafonne le rattrapage par exécution, puis poursuit à l'exécution suivante", async () => {
    const t = await createRecurringTemplate(db, actor, tpl({ name: "Hebdo", frequency: "weekly", startDate: "2024-01-01" }));
    const first = await runRecurring(db, { today: "2026-12-31", templateId: t.id });
    expect(first.generated).toHaveLength(MAX_CATCH_UP);
    const second = await runRecurring(db, { today: "2026-12-31", templateId: t.id });
    expect(second.generated).toHaveLength(MAX_CATCH_UP);
    expect((await getRecurringTemplate(db, t.id))!.template.runIndex).toBe(2 * MAX_CATCH_UP);
    await setRecurringStatus(db, actor, t.id, "ended");
  });

  it("s'arrête à la date de fin et passe le modèle à « terminé »", async () => {
    const t = await createRecurringTemplate(db, actor, tpl({ name: "Contrat 3 mois", startDate: "2026-01-10", endDate: "2026-03-10" }));
    const s = await runRecurring(db, { today: "2026-09-01", templateId: t.id });
    expect(s.generated.map((g) => g.scheduledDate)).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
    expect((await getRecurringTemplate(db, t.id))!.template.status).toBe("ended");
    expect((await runRecurring(db, { today: "2027-01-01", templateId: t.id })).generated).toHaveLength(0);
    expect(await errorOf(updateRecurringTemplate(db, actor, t.id, tpl()))).toBeInstanceOf(ServiceError);
  });

  it("ne génère pas pour un modèle en pause, puis rattrape à la reprise", async () => {
    const t = await createRecurringTemplate(db, actor, tpl({ name: "Pause", startDate: "2026-02-01" }));
    await setRecurringStatus(db, actor, t.id, "paused");
    expect((await runRecurring(db, { today: "2026-04-15", templateId: t.id })).generated).toHaveLength(0);
    await setRecurringStatus(db, actor, t.id, "active");
    expect((await runRecurring(db, { today: "2026-04-15", templateId: t.id })).generated).toHaveLength(3); // fév., mars, avril
  });

  it("empêche deux exécutions simultanées de générer deux fois la même période", async () => {
    const t = await createRecurringTemplate(db, actor, tpl({ name: "Concurrent", startDate: "2026-05-01" }));
    await Promise.all([
      runRecurring(db, { today: "2026-07-01", templateId: t.id }),
      runRecurring(db, { today: "2026-07-01", templateId: t.id }),
    ]);
    const dates = (await invoicesOf(t.id)).map((r) => r.inv.issueDate).sort();
    expect(dates).toEqual(["2026-05-01", "2026-06-01", "2026-07-01"]); // exactement une facture par période
    const dup = await errorOf(db.insert(recurringRuns).values({ templateId: t.id, periodIndex: 0, scheduledDate: "2026-05-01", status: "generated" }));
    expect(`${dup?.message} ${dup?.cause?.message}`).toMatch(/recurring_runs_period_uq|duplicate/);
  });

  it("modifie les lignes d'un modèle en cours, mais verrouille début et fréquence", async () => {
    const t = await createRecurringTemplate(db, actor, tpl({ name: "Évolutif", startDate: "2026-08-01" }));
    await runRecurring(db, { today: "2026-08-01", templateId: t.id });
    expect(await errorOf(updateRecurringTemplate(db, actor, t.id, tpl({ name: "Évolutif", startDate: "2026-08-05" })))).toBeInstanceOf(ServiceError);
    expect(await errorOf(updateRecurringTemplate(db, actor, t.id, tpl({ name: "Évolutif", startDate: "2026-08-01", frequency: "yearly" })))).toBeInstanceOf(ServiceError);
    await updateRecurringTemplate(db, actor, t.id, tpl({ name: "Évolutif", startDate: "2026-08-01", lines: [line({ unitPrice: "250" })] }));
    const s = await runRecurring(db, { today: "2026-09-01", templateId: t.id });
    expect((await getInvoice(db, s.generated[0]!.invoiceId))!.invoice.totalHt).toBe("250.000"); // nouveau prix, période suivante
    expect(await errorOf(deleteRecurringTemplate(db, actor, t.id))).toBeInstanceOf(ServiceError); // historique : pas de suppression
  });
});

describe("validation et envoi automatiques", () => {
  it("valide et numérote, sans jamais reculer avant la dernière facture validée", async () => {
    const existing = await createDraftInvoice(db, actor, { customerId: alpha, issueDate: "2027-03-01", lines: [line()] });
    await validateDocument(db, actor, existing.id);

    const t = await createRecurringTemplate(db, actor, tpl({ name: "Auto", startDate: "2027-02-01", autoValidate: true }));
    const s = await runRecurring(db, { today: "2027-02-05", templateId: t.id });
    const g = s.generated[0]!;
    expect(g).toMatchObject({ validated: true, scheduledDate: "2027-02-01" });
    expect(g.invoiceNumber).toMatch(/^FAC-2027-\d{5}$/);
    const inv = (await getInvoice(db, g.invoiceId))!.invoice;
    expect(inv).toMatchObject({ status: "validated", issueDate: "2027-03-01" }); // date relevée : l'ordre chronologique est respecté
    expect(inv.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("envoie la facture validée par e-mail, journalise, et ne bloque rien en cas d'échec ou d'absence d'adresse", async () => {
    const t = new MemoryTransport();
    const ok = await createRecurringTemplate(db, actor, tpl({ name: "Envoi OK", startDate: "2027-04-01", autoValidate: true, autoSend: true }));
    const s1 = await runRecurring(db, { today: "2027-04-01", templateId: ok.id, transport: t });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ to: "compta@alpha.tn" });
    expect(t.sent[0]!.attachments?.[0]?.contentType).toBe("application/pdf");
    expect(s1.generated[0]!.email).toBe("compta@alpha.tn");
    expect((await db.select().from(recurringRuns).where(eq(recurringRuns.templateId, ok.id)))[0]).toMatchObject({ status: "generated", emailStatus: "sent" });

    const none = await createRecurringTemplate(db, actor, tpl({ name: "Sans adresse", customerId: noMail, startDate: "2027-04-01", autoValidate: true, autoSend: true }));
    await runRecurring(db, { today: "2027-04-01", templateId: none.id, transport: t });
    expect((await db.select().from(recurringRuns).where(eq(recurringRuns.templateId, none.id)))[0]).toMatchObject({ status: "generated", emailStatus: "skipped" });
    expect(t.sent).toHaveLength(1);

    const broken = new MemoryTransport();
    broken.failAlways = "SMTP indisponible";
    const failing = await createRecurringTemplate(db, actor, tpl({ name: "SMTP KO", startDate: "2027-04-01", autoValidate: true, autoSend: true }));
    const s3 = await runRecurring(db, { today: "2027-04-01", templateId: failing.id, transport: broken });
    expect(s3.generated).toHaveLength(1); // la facture existe malgré l'échec d'envoi
    expect((await db.select().from(recurringRuns).where(eq(recurringRuns.templateId, failing.id)))[0]).toMatchObject({ status: "generated", emailStatus: "failed" });
    expect((await invoicesOf(failing.id))[0]!.inv.status).toBe("validated");
  });

  it("n'envoie rien quand la validation automatique n'est pas activée", async () => {
    const t = new MemoryTransport();
    const draft = await createRecurringTemplate(db, actor, tpl({ name: "Brouillon seul", startDate: "2027-05-01" }));
    await runRecurring(db, { today: "2027-05-01", templateId: draft.id, transport: t });
    expect(t.sent).toHaveLength(0);
    expect((await db.select().from(recurringRuns).where(eq(recurringRuns.templateId, draft.id)))[0]!.emailStatus).toBeNull();
  });
});

describe("échecs", () => {
  it("annule tout en cas d'échec (aucune facture, période non avancée), garde la trace et réessaie ensuite", async () => {
    const c = await createCustomer(db, actor, { type: "entreprise", name: "Client fragile", matriculeFiscal: "3333333/A/M/000", taxStatus: "assujetti", email: "f@x.tn" });
    const t = await createRecurringTemplate(db, actor, tpl({ name: "Fragile", customerId: c.id, startDate: "2027-06-01" }));
    await setCustomerActive(db, actor, c.id, false);

    const failed = await runRecurring(db, { today: "2027-06-15", templateId: t.id });
    expect(failed.generated).toHaveLength(0);
    expect(failed.failed[0]).toMatchObject({ templateName: "Fragile", scheduledDate: "2027-06-01" });
    expect(failed.failed[0]!.error).toMatch(/désactivé/);
    expect(await invoicesOf(t.id)).toHaveLength(0);
    expect((await getRecurringTemplate(db, t.id))!.template).toMatchObject({ runIndex: 0, nextRunDate: "2027-06-01" });
    const runs = await db.select().from(recurringRuns).where(eq(recurringRuns.templateId, t.id));
    expect(runs.map((r) => r.status)).toEqual(["failed"]);

    // Le problème est corrigé : la même période est retentée et générée.
    await setCustomerActive(db, actor, c.id, true);
    const retry = await runRecurring(db, { today: "2027-06-15", templateId: t.id });
    expect(retry.generated.map((g) => g.scheduledDate)).toEqual(["2027-06-01"]);
    const all = await db.select().from(recurringRuns).where(and(eq(recurringRuns.templateId, t.id)));
    expect(all.map((r) => r.status).sort()).toEqual(["failed", "generated"]);
  });

  it("échoue proprement quand le taux de TVA du modèle est désactivé (aucune facture orpheline), puis reprend", async () => {
    const t = await createRecurringTemplate(db, actor, tpl({ name: "TVA périmée", startDate: "2027-07-01", autoValidate: true }));
    await updateTaxRate(db, actor, tvaId, { isActive: false });
    const before = (await db.select().from(invoices)).length;
    const s = await runRecurring(db, { today: "2027-07-01", templateId: t.id });
    expect(s.generated).toHaveLength(0);
    expect(s.failed[0]!.error).toMatch(/inactif/);
    expect((await db.select().from(invoices)).length).toBe(before); // rien n'est resté à moitié
    expect((await getRecurringTemplate(db, t.id))!.template.runIndex).toBe(0);

    await updateTaxRate(db, actor, tvaId, { isActive: true });
    const retry = await runRecurring(db, { today: "2027-07-01", templateId: t.id });
    expect(retry.generated).toHaveLength(1);
    expect(retry.generated[0]!.invoiceNumber).toMatch(/^FAC-2027-\d{5}$/);
  });
});
