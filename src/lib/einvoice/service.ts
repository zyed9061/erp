import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/types";
import { einvoiceExports, type EinvoiceExport } from "@/db/schema";
import { audit } from "../audit";
import { ServiceError, type Actor } from "../errors";
import { getInvoice } from "../invoicing/invoices";
import { checkReadiness, type Readiness } from "./readiness";
import { buildTeifXml, type EinvoiceData, type EinvoiceParty } from "./teif";
import { GENERATOR_VERSION } from "./teif-codes";

type Snapshot = Record<string, unknown> | null;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function partyOf(source: Snapshot, nameKey: string): EinvoiceParty {
  const s = source ?? {};
  return {
    name: text(s[nameKey]) ?? "", matriculeFiscal: text(s.matriculeFiscal), address: text(s.address), city: text(s.city),
    postalCode: text(s.postalCode), country: text(s.country) ?? "TN",
  };
}

/** Données TEIF d'une facture VALIDÉE, lues dans les instantanés figés (jamais dans les fiches courantes). */
export async function loadEinvoiceData(db: Db, invoiceId: string): Promise<{ data: EinvoiceData; contentHash: string } | null> {
  const details = await getInvoice(db, invoiceId);
  if (!details) return null;
  const { invoice: inv, lines, taxes, original } = details;
  if (inv.status !== "validated" || !inv.number || !inv.contentHash) return null;

  const cs = (inv.customerSnapshot ?? null) as Snapshot;
  const data: EinvoiceData = {
    kind: inv.kind, number: inv.number, issueDate: inv.issueDate, dueDate: inv.dueDate, currency: inv.currency,
    reference: inv.reference, notes: inv.notes, originalNumber: original?.number ?? null,
    company: partyOf((inv.companySnapshot ?? null) as Snapshot, "legalName"),
    customer: { ...partyOf(cs, "name"), type: text(cs?.type) ?? "entreprise" },
    lines: lines.map((l) => ({
      position: l.position, description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
      discountPercent: l.discountPercent, tvaCode: l.tvaCode, tvaRate: l.tvaRate, fodecRate: l.fodecRate,
      netHt: l.lineNetHt ?? "0.000", fodec: l.lineFodec ?? "0.000",
    })),
    taxes: taxes.filter((t) => t.kind === "tva" || t.kind === "fodec")
      .map((t) => ({ kind: t.kind as "tva" | "fodec", rate: t.rate, base: t.base ?? "0.000", amount: t.amount ?? "0.000" })),
    totals: {
      ht: inv.totalHt ?? "0.000", fodec: inv.totalFodec ?? "0.000", tvaBase: inv.totalTvaBase ?? "0.000", tva: inv.totalTva ?? "0.000",
      ttc: inv.totalTtc ?? "0.000", stampDuty: inv.stampDuty ?? "0.000", withholdingRate: inv.withholdingRate,
      withholdingAmount: inv.withholdingAmount ?? "0.000", netToPay: inv.netToPay ?? "0.000",
    },
  };
  return { data, contentHash: inv.contentHash };
}

export type EinvoiceStatus = {
  /** null : brouillon, donc pas de préparation possible. */
  readiness: Readiness | null;
  latest: EinvoiceExport | null;
};

export async function getEinvoiceStatus(db: Db, invoiceId: string): Promise<EinvoiceStatus> {
  const loaded = await loadEinvoiceData(db, invoiceId);
  const [latest] = await db.select().from(einvoiceExports).where(eq(einvoiceExports.invoiceId, invoiceId))
    .orderBy(desc(einvoiceExports.createdAt)).limit(1);
  return { readiness: loaded ? checkReadiness(loaded.data) : null, latest: latest ?? null };
}

/**
 * Prépare (génère et conserve) le fichier TEIF d'une facture validée. Refuse si des données obligatoires manquent.
 * Idempotent : redemander la préparation renvoie le fichier déjà conservé pour cette version du générateur.
 */
export async function prepareEinvoice(db: Db, actor: Actor, invoiceId: string): Promise<{ export: EinvoiceExport; created: boolean }> {
  const loaded = await loadEinvoiceData(db, invoiceId);
  if (!loaded) throw new ServiceError("Seule une facture validée peut être préparée pour le TEIF");
  const { errors, warnings } = checkReadiness(loaded.data);
  if (errors.length > 0) throw new ServiceError(`Préparation TEIF impossible : ${errors.join(" ")}`);

  const xml = buildTeifXml(loaded.data);
  const xmlSha256 = createHash("sha256").update(xml).digest("hex");

  return db.transaction(async (tx) => {
    const [created] = await tx.insert(einvoiceExports).values({
      invoiceId, generatorVersion: GENERATOR_VERSION, xml, xmlSha256, invoiceContentHash: loaded.contentHash, warnings, createdBy: actor.id,
    }).onConflictDoNothing().returning();
    if (created) {
      await audit(tx, {
        userId: actor.id, userEmail: actor.email, ip: actor.ip, action: "einvoice.prepare", entity: "invoice", entityId: invoiceId,
        after: { number: loaded.data.number, generatorVersion: GENERATOR_VERSION, xmlSha256 },
      });
      return { export: created, created: true };
    }
    const [existing] = await tx.select().from(einvoiceExports)
      .where(and(eq(einvoiceExports.invoiceId, invoiceId), eq(einvoiceExports.generatorVersion, GENERATOR_VERSION)));
    return { export: existing!, created: false };
  });
}

/** Fichier conservé d'une facture (le plus récent). */
export async function getEinvoiceExport(db: Db, invoiceId: string): Promise<EinvoiceExport | null> {
  const [row] = await db.select().from(einvoiceExports).where(eq(einvoiceExports.invoiceId, invoiceId))
    .orderBy(desc(einvoiceExports.createdAt)).limit(1);
  return row ?? null;
}
