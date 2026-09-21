import type { Db } from "@/db/types";
import { getCompany } from "../company";
import { getInvoice } from "../invoicing/invoices";
import { getQuote } from "../invoicing/quotes";
import { formatPercent } from "../money";
import type { PdfData } from "./render";

const nz = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

const safeFilename = (base: string) => `${base.replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;

const KIND_TITLES = { invoice: "FACTURE", credit_note: "AVOIR", deposit_invoice: "FACTURE D'ACOMPTE" } as const;
const KIND_WORDS = {
  invoice: "Arrêtée la présente facture à la somme de :",
  credit_note: "Arrêté le présent avoir à la somme de :",
  deposit_invoice: "Arrêtée la présente facture d'acompte à la somme de :",
} as const;

type Snapshot = Record<string, unknown> | null;

function companyOf(source: Snapshot) {
  const s = source ?? {};
  return {
    legalName: nz(s.legalName) ?? "", tradeName: nz(s.tradeName), matriculeFiscal: nz(s.matriculeFiscal),
    legalForm: nz(s.legalForm), capital: nz(s.capital), address: nz(s.address), postalCode: nz(s.postalCode),
    city: nz(s.city), phone: nz(s.phone), email: nz(s.email), bankName: nz(s.bankName), rib: nz(s.rib),
  };
}

/**
 * Données d'impression d'une facture, d'un avoir ou d'un acompte. Un document validé utilise les
 * instantanés figés à la validation (le PDF reste identique même si la fiche client change) ;
 * un brouillon utilise les données courantes.
 */
export async function loadInvoicePdf(db: Db, id: string): Promise<{ data: PdfData; filename: string } | null> {
  const details = await getInvoice(db, id);
  if (!details) return null;
  const { invoice: inv, lines, taxes, customer, original } = details;
  const validated = inv.status === "validated";

  const companySource: Snapshot = validated ? (inv.companySnapshot as Snapshot) : ((await getCompany(db)) as unknown as Snapshot);
  const customerSource: Snapshot = validated ? (inv.customerSnapshot as Snapshot) : ((customer ?? null) as unknown as Snapshot);
  const cs = customerSource ?? {};

  const data: PdfData = {
    title: KIND_TITLES[inv.kind],
    number: inv.number,
    isDraft: !validated,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    validUntil: null,
    reference: inv.reference,
    creditOf: original ? { number: original.number ?? "", reason: inv.creditReason } : null,
    company: companyOf(companySource),
    customer: {
      name: nz(cs.name) ?? "", matriculeFiscal: nz(cs.matriculeFiscal), address: nz(cs.address),
      postalCode: nz(cs.postalCode), city: nz(cs.city),
    },
    lines: lines.map((l) => ({
      description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
      discountPercent: l.discountPercent, tva: l.tvaCode === "EXO" ? "Exo." : formatPercent(l.tvaRate), netHt: l.lineNetHt,
    })),
    taxes: taxes.map((t) => ({ kind: (t.kind === "fodec" ? "fodec" : "tva") as "fodec" | "tva", rate: t.rate, base: t.base, amount: t.amount }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || Number(a.rate) - Number(b.rate)),
    totals: {
      ht: inv.totalHt, fodec: inv.totalFodec, tva: inv.totalTva, ttc: inv.totalTtc, stampDuty: inv.stampDuty,
      withholdingRate: inv.withholdingRate, withholdingAmount: inv.withholdingAmount, netToPay: inv.netToPay,
    },
    wordsAmount: inv.netToPay,
    wordsIntro: KIND_WORDS[inv.kind],
    notes: inv.notes,
    fingerprint: inv.contentHash ? inv.contentHash.slice(0, 12) : null,
  };
  return { data, filename: safeFilename(inv.number ?? `brouillon-${inv.id.slice(0, 8)}`) };
}

/** Données d'impression d'un devis (pas de timbre ni de retenue à ce stade). */
export async function loadQuotePdf(db: Db, id: string): Promise<{ data: PdfData; filename: string } | null> {
  const details = await getQuote(db, id);
  if (!details) return null;
  const { quote: q, lines, taxes, customer } = details;
  const company = await getCompany(db);

  const data: PdfData = {
    title: "DEVIS",
    number: q.number,
    isDraft: q.status === "draft",
    issueDate: q.issueDate,
    dueDate: null,
    validUntil: q.validUntil,
    reference: q.reference,
    creditOf: null,
    company: companyOf(company as unknown as Snapshot),
    customer: {
      name: customer?.name ?? "", matriculeFiscal: customer?.matriculeFiscal ?? null, address: customer?.address ?? null,
      postalCode: customer?.postalCode ?? null, city: customer?.city ?? null,
    },
    lines: lines.map((l) => ({
      description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
      discountPercent: l.discountPercent, tva: l.tvaCode === "EXO" ? "Exo." : formatPercent(l.tvaRate), netHt: l.lineNetHt,
    })),
    taxes: taxes.map((t) => ({ kind: t.kind, rate: t.rate, base: t.base, amount: t.amount })),
    totals: {
      ht: q.totalHt, fodec: q.totalFodec, tva: q.totalTva, ttc: q.totalTtc, stampDuty: "0.000",
      withholdingRate: null, withholdingAmount: "0.000", netToPay: q.totalTtc,
    },
    wordsAmount: q.totalTtc,
    wordsIntro: "Arrêté le présent devis à la somme de :",
    notes: q.notes,
    fingerprint: null,
  };
  return { data, filename: safeFilename(q.number ?? `devis-brouillon-${q.id.slice(0, 8)}`) };
}
