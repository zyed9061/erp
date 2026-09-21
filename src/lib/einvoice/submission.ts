import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/types";
import { einvoiceSubmissions, type EinvoiceSubmission } from "@/db/schema";
import { audit } from "../audit";
import { ServiceError, type Actor } from "../errors";
import { loadEinvoiceData, prepareEinvoice } from "./service";
import { getSigner, type Signer } from "./signature";
import { getTtnClient, type TtnClient } from "./ttn";

/**
 * Circuit « préparer → signer → envoyer à TTN » et son historique. En démonstration, la signature et TTN sont simulés
 * (voir signature.ts et ttn.ts) ; hors démonstration, l'envoi est refusé tant que les éléments officiels manquent.
 */
export async function submitToTtn(
  db: Db, actor: Actor, invoiceId: string, deps: { signer?: Signer; client?: TtnClient } = {},
): Promise<{ submission: EinvoiceSubmission; created: boolean }> {
  const signer = deps.signer ?? getSigner();
  const client = deps.client ?? getTtnClient();

  const latest = await latestSubmission(db, invoiceId);
  if (latest?.status === "accepted") return { submission: latest, created: false }; // jamais envoyée deux fois

  const { export: exp } = await prepareEinvoice(db, actor, invoiceId);
  const invoice = await loadEinvoiceData(db, invoiceId);
  if (!invoice) throw new ServiceError("Facture introuvable");

  const signedXml = signer.sign(exp.xml);
  const response = await client.submit({ signedXml, invoiceNumber: invoice.data.number, customerName: invoice.data.customer.name });

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(einvoiceSubmissions).values({
      invoiceId, exportId: exp.id, mode: client.mode, status: response.status, ttnReference: response.reference,
      signatureAlgorithm: signer.algorithm, signedXml, signedXmlSha256: createHash("sha256").update(signedXml).digest("hex"),
      message: response.message, createdBy: actor.id,
    }).returning();
    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip, action: "einvoice.submit", entity: "invoice", entityId: invoiceId,
      after: { mode: client.mode, status: response.status, reference: response.reference, signedXmlSha256: row!.signedXmlSha256 },
    });
    return { submission: row!, created: true };
  });
}

export async function latestSubmission(db: Db, invoiceId: string): Promise<EinvoiceSubmission | null> {
  const [row] = await db.select().from(einvoiceSubmissions).where(eq(einvoiceSubmissions.invoiceId, invoiceId))
    .orderBy(desc(einvoiceSubmissions.createdAt), desc(einvoiceSubmissions.id)).limit(1);
  return row ?? null;
}

export async function listSubmissions(db: Db, invoiceId: string): Promise<EinvoiceSubmission[]> {
  return db.select().from(einvoiceSubmissions).where(eq(einvoiceSubmissions.invoiceId, invoiceId))
    .orderBy(desc(einvoiceSubmissions.createdAt), desc(einvoiceSubmissions.id));
}
