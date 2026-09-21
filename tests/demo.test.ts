import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { eq, sql } from "drizzle-orm";
import { auditLog, customers, einvoiceSubmissions, invoices } from "@/db/schema";
import type { Db } from "@/db/types";
import { verifyPassword } from "@/lib/auth/password";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { isDemoMode } from "@/lib/demo/mode";
import { DEMO_COMPANY_NAME, seedDemoData } from "@/lib/demo/seed";
import { checkReadiness } from "@/lib/einvoice/readiness";
import { DEMO_QR_CAPTION, demoQrPayload, qrMatrix } from "@/lib/einvoice/qr";
import { loadEinvoiceData } from "@/lib/einvoice/service";
import { MockSigner, getSigner, stripDemoSignature, verifyDemoSignature } from "@/lib/einvoice/signature";
import { latestSubmission, listSubmissions, submitToTtn } from "@/lib/einvoice/submission";
import { MockTtnClient, getTtnClient } from "@/lib/einvoice/ttn";
import { ServiceError } from "@/lib/errors";
import { getInvoice } from "@/lib/invoicing/invoices";
import { loadInvoicePdf } from "@/lib/pdf/loaders";
import { isSimulatedMail } from "@/lib/mail/transport";
import { users } from "@/db/schema";
import { createTestDb } from "./helpers";

async function pdfText(bytes: Uint8Array) {
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    text += (await (await doc.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  await task.destroy();
  return text;
}

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>\n<TEIF version="x">\n  <A>1</A>\n</TEIF>\n`;
const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: Error & { cause?: Error }) => e);

describe("mode démonstration", () => {
  it("n'est actif que sur DEMO_MODE=true, et les simulations sont refusées sinon", () => {
    expect(isDemoMode(env({ DEMO_MODE: "true" }))).toBe(true);
    expect(isDemoMode(env({ DEMO_MODE: "1" }))).toBe(false);
    expect(isDemoMode(env({}))).toBe(false);
    expect(() => getSigner(env({}))).toThrow(/À FOURNIR PAR TTN/);
    expect(() => getTtnClient(env({}))).toThrow(/À FOURNIR PAR TTN/);
    expect(getSigner(env({ DEMO_MODE: "true" }))).toBeInstanceOf(MockSigner);
    expect(getTtnClient(env({ DEMO_MODE: "true" }))).toBeInstanceOf(MockTtnClient);
  });

  it("annonce un e-mail simulé tant que SMTP n'est pas configuré", () => {
    expect(isSimulatedMail(env({}))).toBe(true);
    expect(isSimulatedMail(env({ SMTP_HOST: "smtp.exemple.tn" }))).toBe(false);
  });
});

describe("signature simulée", () => {
  it("signe, vérifie, et se déclare simulée (aucune valeur légale)", () => {
    const signed = new MockSigner().sign(SAMPLE);
    expect(signed).toContain('<DemoSignature mode="SIMULATION" official="false"');
    expect(signed.trimEnd().endsWith("</TEIF>")).toBe(true);
    expect(verifyDemoSignature(signed)).toBe(true);
    expect(stripDemoSignature(signed)).toBe(SAMPLE);
  });

  it("détecte toute modification après la signature, et l'absence de signature", () => {
    const signed = new MockSigner().sign(SAMPLE);
    expect(verifyDemoSignature(signed.replace("<A>1</A>", "<A>2</A>"))).toBe(false);
    expect(verifyDemoSignature(signed.replace(/>[^<>]{20,}<\/DemoSignature>/, ">AAAA</DemoSignature>"))).toBe(false);
    expect(verifyDemoSignature(SAMPLE)).toBe(false);
  });

  it("re-signer ne double pas la signature", () => {
    const twice = new MockSigner().sign(new MockSigner().sign(SAMPLE));
    expect(twice.match(/<DemoSignature /g)).toHaveLength(1);
    expect(verifyDemoSignature(twice)).toBe(true);
  });
});

describe("TTN simulée", () => {
  const client = new MockTtnClient();
  const signed = new MockSigner().sign(SAMPLE);

  it("accepte un fichier signé, avec une référence simulée déterministe", async () => {
    const a = await client.submit({ signedXml: signed, invoiceNumber: "FA-1", customerName: "Alpha" });
    const b = await client.submit({ signedXml: signed, invoiceNumber: "FA-1", customerName: "Alpha" });
    expect(a).toMatchObject({ status: "accepted" });
    expect(a.reference).toMatch(/^MOCK-TTN-[0-9A-F]{10}$/);
    expect(b.reference).toBe(a.reference);
    expect(a.message).toContain("SIMULATION");
  });

  it("rejette un fichier non signé ou modifié, et le client de démonstration REJET-DEMO", async () => {
    expect((await client.submit({ signedXml: SAMPLE, invoiceNumber: "FA-1", customerName: "Alpha" })).status).toBe("rejected");
    expect((await client.submit({ signedXml: signed.replace("<A>1</A>", "<A>9</A>"), invoiceNumber: "FA-1", customerName: "Alpha" })).status).toBe("rejected");
    const r = await client.submit({ signedXml: signed, invoiceNumber: "FA-1", customerName: "Client Démo rejet-demo SARL" });
    expect(r).toMatchObject({ status: "rejected", reference: null });
    expect(r.message).toContain("SIMULATION");
  });
});

describe("QR code de démonstration", () => {
  it("produit une matrice carrée et déterministe, au contenu clairement non officiel", () => {
    const payload = demoQrPayload({ number: "FA-1", xmlSha256: "a".repeat(64), reference: "MOCK-TTN-0123456789" });
    expect(payload.startsWith("DEMO-NON-OFFICIEL|FA-1|")).toBe(true);
    const m = qrMatrix(payload);
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    expect(m.flat().some(Boolean) && m.flat().some((x) => !x)).toBe(true);
    expect(qrMatrix(payload)).toEqual(m);
    expect(qrMatrix(payload + "x")).not.toEqual(m);
  });
});

describe("données de démonstration et parcours complet", () => {
  let db: Db;
  let close: () => Promise<void>;
  const prev = process.env.DEMO_MODE;

  beforeAll(async () => {
    process.env.DEMO_MODE = "true";
    ({ db, close } = await createTestDb());
    await seedDemoData(db);
  });
  afterAll(async () => {
    if (prev === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = prev;
    await close();
  });

  const byRef = async (ref: string) => (await db.select().from(invoices).where(eq(invoices.reference, ref)))[0]!;
  const actorOf = async () => {
    const [a] = await db.select().from(users).where(eq(users.email, "admin@demo.test"));
    return { id: a!.id, email: a!.email };
  };

  it("installe une société et des clients entièrement fictifs, et refuse de se réinstaller", async () => {
    expect((await db.select().from(customers)).map((c) => c.name).every((n) => n.startsWith("Client Démo"))).toBe(true);
    const r = await db.execute(sql`select legal_name, matricule_fiscal from company_settings`) as unknown as { rows?: Record<string, string>[] } & Record<string, string>[];
    const row = (r.rows ?? r)[0]!;
    expect(row.legal_name).toBe(DEMO_COMPANY_NAME);
    expect(row.matricule_fiscal).toBe("0000000A/A/M/000");
    expect(await seedDemoData(db)).toEqual({ seeded: false });
  });

  it("crée les quatre comptes de démonstration avec leurs mots de passe publics", async () => {
    for (const a of DEMO_ACCOUNTS) {
      const [u] = await db.select().from(users).where(eq(users.email, a.email));
      expect(u!.role).toBe(a.role);
      expect(await verifyPassword(a.password, u!.passwordHash)).toBe(true);
    }
  });

  it("produit des documents cohérents : factures validées, avoir rattaché, brouillon, aucune erreur d'export", async () => {
    const all = await db.select().from(invoices);
    expect(all.filter((i) => i.status === "validated" && i.kind === "invoice")).toHaveLength(3);
    expect(all.filter((i) => i.kind === "credit_note")).toHaveLength(1);
    expect(all.filter((i) => i.status === "draft")).toHaveLength(1);
    for (const i of all.filter((x) => x.status === "validated")) {
      const loaded = await loadEinvoiceData(db, i.id);
      expect(checkReadiness(loaded!.data).errors, i.number ?? "").toEqual([]);
    }
  });

  it("a simulé l'envoi TTN : une facture acceptée avec sa référence, une refusée (client REJET-DEMO)", async () => {
    const ok = await latestSubmission(db, (await byRef("DEMO-BC-001")).id);
    expect(ok).toMatchObject({ status: "accepted", mode: "mock", signatureAlgorithm: "DEMO-HMAC-SHA256" });
    expect(ok!.ttnReference).toMatch(/^MOCK-TTN-/);
    expect(verifyDemoSignature(ok!.signedXml)).toBe(true);
    const ko = await latestSubmission(db, (await byRef("DEMO-BC-003")).id);
    expect(ko).toMatchObject({ status: "rejected", ttnReference: null });
    expect(await latestSubmission(db, (await byRef("DEMO-BC-002")).id)).toBeNull();
  });

  it("le PDF d'une facture acceptée porte le QR de démonstration, pas les autres ni les brouillons", async () => {
    const accepted = await loadInvoicePdf(db, (await byRef("DEMO-BC-001")).id);
    expect(accepted!.data.demoQr!.payload.startsWith("DEMO-NON-OFFICIEL|")).toBe(true);
    const { renderDocumentPdf } = await import("@/lib/pdf/render");
    const text = await pdfText(await renderDocumentPdf(accepted!.data));
    expect(text).toContain("DÉMONSTRATION");
    expect(text).toContain(DEMO_QR_CAPTION);
    expect(text).toContain("MOCK-TTN-");
    for (const ref of ["DEMO-BC-002", "DEMO-BC-003", "DEMO-BROUILLON"]) {
      const other = await loadInvoicePdf(db, (await byRef(ref)).id);
      expect(other!.data.demoQr, ref).toBeNull();
    }
  });

  it("envoie à la TTN simulée une nouvelle facture, une seule fois, avec historique et traçabilité", async () => {
    const actor = await actorOf();
    const inv = await byRef("DEMO-BC-002");
    const first = await submitToTtn(db, actor, inv.id);
    expect(first).toMatchObject({ created: true, submission: { status: "accepted" } });
    const again = await submitToTtn(db, actor, inv.id);
    expect(again.created).toBe(false);
    expect(again.submission.id).toBe(first.submission.id);
    expect(await listSubmissions(db, inv.id)).toHaveLength(1);
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, inv.id));
    expect(audits.filter((a) => a.action === "einvoice.submit")).toHaveLength(1);
    expect(audits.some((a) => a.action === "einvoice.prepare")).toBe(true);
  });

  it("garde chaque tentative refusée et laisse réessayer, sans jamais modifier l'historique", async () => {
    const actor = await actorOf();
    const inv = await byRef("DEMO-BC-003");
    const before = (await listSubmissions(db, inv.id)).length;
    const retry = await submitToTtn(db, actor, inv.id);
    expect(retry).toMatchObject({ created: true, submission: { status: "rejected" } });
    expect(await listSubmissions(db, inv.id)).toHaveLength(before + 1);
    const up = await errorOf(db.update(einvoiceSubmissions).set({ status: "accepted" }).where(eq(einvoiceSubmissions.invoiceId, inv.id)));
    expect(`${up?.message} ${up?.cause?.message}`).toContain("ajout seul");
    const del = await errorOf(db.delete(einvoiceSubmissions).where(eq(einvoiceSubmissions.invoiceId, inv.id)));
    expect(`${del?.message} ${del?.cause?.message}`).toContain("ajout seul");
  });

  it("refuse d'envoyer un brouillon ou une facture inconnue", async () => {
    const actor = await actorOf();
    await expect(submitToTtn(db, actor, (await byRef("DEMO-BROUILLON")).id)).rejects.toBeInstanceOf(ServiceError);
    await expect(submitToTtn(db, actor, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(ServiceError);
  });

  it("refuse une transmission dont l'export serait celui d'une autre facture (garde en base)", async () => {
    const a = await byRef("DEMO-BC-001");
    const b = await byRef("DEMO-BC-002");
    const sub = await latestSubmission(db, a.id);
    const err = await errorOf(db.insert(einvoiceSubmissions).values({
      invoiceId: b.id, exportId: sub!.exportId, mode: "mock", status: "rejected", signatureAlgorithm: "x", signedXml: "<x/>", signedXmlSha256: "0",
    }));
    expect(`${err?.message} ${err?.cause?.message}`).toContain("ne correspond pas");
  });

  it("garde intactes les factures validées : l'envoi n'a rien modifié", async () => {
    const inv = (await getInvoice(db, (await byRef("DEMO-BC-001")).id))!.invoice;
    expect(inv.status).toBe("validated");
    expect(inv.contentHash).toBeTruthy();
  });
});
