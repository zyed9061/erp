/**
 * Pure generator for the ML demo dataset: builds realistic clients, products, quotes,
 * invoices, payments and credit notes in memory, without touching the database.
 *
 * Payment behaviour is driven by hidden client personas plus invoice-level effects
 * (amount, payment terms, seasonality) and randomness, so ML models have a real but
 * imperfect signal to learn. The personas, the true late-payment probability of each
 * invoice and the injected anomalies are returned separately as ground truth: they are
 * written to CSV files for model evaluation and never stored in the application database.
 */
import { calculerLigne, calculerTotaux } from "../../src/lib/calculs";
import { Random } from "./random";
import {
  CITIES,
  COMPANY_ACTIVITIES,
  COMPANY_FORMS,
  COMPANY_PREFIXES,
  CREDIT_NOTE_REASONS,
  FIRST_NAMES,
  LAST_NAMES,
  PRODUCTS,
  STREETS,
  type CatalogProduct,
} from "./catalog";

// ---------------------------------------------------------------- types

export type Persona = "RELIABLE" | "OCCASIONAL" | "CHRONIC" | "QUARTER_END" | "NEW_RISKY";
export type AnomalyType = "DUPLICATE" | "WRONG_VAT" | "AMOUNT_SPIKE" | "ODD_DISCOUNT";
type ClientType = "ENTREPRISE" | "PARTICULIER";
type ModePaiement = "VIREMENT" | "CHEQUE" | "ESPECES" | "CARTE" | "AUTRE";

export interface DemoOptions {
  seed: number;
  /** Last day of the generated history ("today"). */
  referenceDate: Date;
  months: number;
  clientCount: number;
  /** Approximate number of regular invoices (duplicate anomalies come on top). */
  invoiceCount: number;
  /** Share of invoices that receive an injected anomaly. */
  anomalyRate: number;
}

export const DEFAULT_OPTIONS: Omit<DemoOptions, "referenceDate"> = {
  seed: 42,
  months: 24,
  clientCount: 60,
  invoiceCount: 1200,
  anomalyRate: 0.02,
};

export interface DemoClient {
  id: string;
  type: ClientType;
  nom: string;
  matriculeFiscal: string | null;
  email: string | null;
  telephone: string;
  adresse: string;
  ville: string;
  codePostal: string;
  createdAt: Date;
}

export interface DemoProduct {
  id: string;
  reference: string;
  designation: string;
  type: "PRODUIT" | "SERVICE";
  categorie: string;
  prixUnitaireHT: number;
  uniteMesure: string;
  tauxTva: number;
  stock: number | null;
  createdAt: Date;
}

export interface DemoLine {
  id: string;
  ordre: number;
  designation: string;
  quantite: number;
  prixUnitaireHT: number;
  remisePct: number;
  tauxTva: number;
  totalHT: number;
  produitId: string;
}

export interface DemoQuote {
  id: string;
  numero: string;
  annee: number;
  dateEmission: Date;
  dateValidite: Date;
  statut: "BROUILLON" | "ENVOYE" | "ACCEPTE" | "REFUSE" | "EXPIRE" | "CONVERTI";
  clientId: string;
  sousTotalHT: number;
  totalTva: number;
  totalTTC: number;
  lignes: DemoLine[];
}

export interface DemoPayment {
  id: string;
  factureId: string;
  datePaiement: Date;
  montant: number;
  modePaiement: ModePaiement;
  reference: string | null;
}

export interface DemoInvoice {
  id: string;
  numero: string;
  annee: number;
  dateEmission: Date;
  dateEcheance: Date | null;
  statut: "BROUILLON" | "ENVOYEE" | "PARTIELLEMENT_PAYEE" | "PAYEE" | "ANNULEE";
  clientId: string;
  devisOrigineId: string | null;
  sousTotalHT: number;
  totalTva: number;
  timbreFiscal: number;
  totalTTC: number;
  montantPaye: number;
  lignes: DemoLine[];
}

export interface DemoCreditNote {
  id: string;
  numero: string;
  annee: number;
  dateEmission: Date;
  statut: "EMIS" | "APPLIQUE" | "REMBOURSE";
  motif: string;
  clientId: string;
  factureOrigineId: string;
  sousTotalHT: number;
  totalTva: number;
  totalTTC: number;
  lignes: Omit<DemoLine, "remisePct">[];
}

export interface InvoiceTruth {
  factureId: string;
  numero: string;
  persona: Persona;
  /** Probability of late payment the generator used for this invoice. */
  trueLateProbability: number;
  /** Planned payment delay in days after the (effective) due date; null if never paid. */
  plannedDelayDays: number | null;
  defaulted: boolean;
}

export interface AnomalyTruth {
  factureId: string;
  numero: string;
  type: AnomalyType;
  detail: string;
}

export interface DemoDataset {
  options: DemoOptions;
  clients: DemoClient[];
  products: DemoProduct[];
  quotes: DemoQuote[];
  invoices: DemoInvoice[];
  payments: DemoPayment[];
  creditNotes: DemoCreditNote[];
  numbering: { type: "DEVIS" | "FACTURE" | "AVOIR"; annee: number; dernierNumero: number }[];
  truth: {
    clientPersonas: { clientId: string; nom: string; persona: Persona }[];
    invoices: InvoiceTruth[];
    anomalies: AnomalyTruth[];
  };
}

// ---------------------------------------------------------------- behaviour model

const PERSONA_SHARES: Record<Persona, number> = {
  RELIABLE: 0.4,
  OCCASIONAL: 0.3,
  CHRONIC: 0.15,
  QUARTER_END: 0.1,
  NEW_RISKY: 0.05,
};

/** Mean extra delay (days, beyond the 7-day grace) when an invoice is paid late. */
const LATE_DELAY_MEAN: Record<Persona, number> = {
  RELIABLE: 8,
  OCCASIONAL: 14,
  CHRONIC: 32,
  QUARTER_END: 22,
  NEW_RISKY: 40,
};

const DEFAULT_PROBABILITY: Record<Persona, number> = {
  RELIABLE: 0.002,
  OCCASIONAL: 0.005,
  CHRONIC: 0.04,
  QUARTER_END: 0.01,
  NEW_RISKY: 0.2,
};

/** Late = paid more than this many days after the due date (the ML label definition). */
export const LATE_THRESHOLD_DAYS = 7;
/** Due date assumed for invoices without one. */
export const DEFAULT_TERM_DAYS = 30;

const DAY = 86_400_000;
const addDays = (date: Date, days: number) => new Date(date.getTime() + Math.round(days) * DAY);
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Dates are stored at 10:00 UTC so they never shift a day across time zones. */
function atTen(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 10));
}

function lateProbability(
  persona: Persona,
  ctx: { emission: Date; due: Date; amountRatio: number; clientType: ClientType; termDays: number; clientAgeDays: number },
): number {
  const quarterEndMonth = ctx.emission.getUTCMonth() % 3 === 2;
  const base: Record<Persona, number> = {
    RELIABLE: 0.06,
    OCCASIONAL: 0.3,
    CHRONIC: 0.78,
    QUARTER_END: quarterEndMonth ? 0.75 : 0.12,
    NEW_RISKY: 0.55,
  };
  let p = base[persona];
  if (ctx.amountRatio > 2) p += 0.15;
  else if (ctx.amountRatio > 1.4) p += 0.07;
  if (ctx.clientType === "PARTICULIER") p += 0.05;
  const dueMonth = ctx.due.getUTCMonth();
  if (dueMonth === 7 || dueMonth === 11) p += 0.1; // August and December holidays
  if (ctx.termDays === 0) p += 0.05;
  if (ctx.clientAgeDays > 540) p -= 0.05; // long-standing relationship
  return clamp(p, 0.01, 0.97);
}

// ---------------------------------------------------------------- generator

interface ClientProfile {
  client: DemoClient;
  persona: Persona;
  termDays: number;
  sizeFactor: number;
  activity: number;
  categories: string[];
}

export function generateDemoDataset(options: DemoOptions): DemoDataset {
  const rng = new Random(options.seed);
  const counters: Record<string, number> = {};
  const id = (prefix: string) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `demo${prefix}${String(counters[prefix]).padStart(5, "0")}`;
  };

  const ref = options.referenceDate;
  const start = atTen(ref.getUTCFullYear(), ref.getUTCMonth() - options.months + 1, 1);

  // ------------------------------------------------ products
  const products: DemoProduct[] = PRODUCTS.map((p) => ({
    id: id("prd"),
    reference: p.reference,
    designation: p.designation,
    type: p.type,
    categorie: p.categorie,
    prixUnitaireHT: p.prixUnitaireHT,
    uniteMesure: p.uniteMesure,
    tauxTva: p.tauxTva,
    stock: p.type === "PRODUIT" ? rng.int(0, 250) : null,
    createdAt: addDays(start, -rng.int(30, 400)),
  }));
  const catalogByProductId = new Map(products.map((p, i) => [p.id, PRODUCTS[i]]));
  const categories = Array.from(new Set(PRODUCTS.map((p) => p.categorie)));

  // ------------------------------------------------ clients
  const personaPool: Persona[] = [];
  for (const [persona, share] of Object.entries(PERSONA_SHARES) as [Persona, number][]) {
    for (let i = 0; i < Math.round(share * options.clientCount); i++) personaPool.push(persona);
  }
  while (personaPool.length < options.clientCount) personaPool.push("OCCASIONAL");
  personaPool.length = options.clientCount;
  // Shuffle so personas are not correlated with creation order or names.
  for (let i = personaPool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [personaPool[i], personaPool[j]] = [personaPool[j], personaPool[i]];
  }

  const usedNames = new Set<string>();
  const profiles: ClientProfile[] = personaPool.map((persona, index) => {
    const type: ClientType = rng.chance(0.8) ? "ENTREPRISE" : "PARTICULIER";
    let nom = "";
    do {
      nom =
        type === "ENTREPRISE"
          ? `${rng.pick(COMPANY_PREFIXES)} ${rng.pick(COMPANY_ACTIVITIES)} ${rng.pick(COMPANY_FORMS)}`
          : `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    } while (usedNames.has(nom));
    usedNames.add(nom);

    const city = rng.pick(CITIES);
    const slug = nom.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
    const createdAt =
      persona === "NEW_RISKY"
        ? addDays(ref, -rng.int(150, 450)) // recent compared with the others, but with some history
        : addDays(start, -rng.int(10, 900) + (index % 7 === 0 ? rng.int(60, 400) : 0));

    const client: DemoClient = {
      id: id("cli"),
      type,
      nom,
      matriculeFiscal:
        type === "ENTREPRISE"
          ? `${rng.int(1000000, 1999999)}${String.fromCharCode(65 + rng.int(0, 25))}/A/M/000`
          : null,
      // ~10% of clients have no email: useful to test "cannot send reminder" paths.
      email: rng.chance(0.9)
        ? type === "ENTREPRISE"
          ? `contact@${slug.replace(/\./g, "-")}.tn`
          : `${slug}@mail.tn`
        : null,
      telephone: `+216 ${rng.int(20, 99)} ${rng.int(100, 999)} ${rng.int(100, 999)}`,
      adresse: `${rng.int(1, 180)} ${rng.pick(STREETS)}`,
      ville: city.ville,
      codePostal: city.codePostal,
      createdAt,
    };

    return {
      client,
      persona,
      termDays: type === "ENTREPRISE" ? rng.pick([15, 30, 30, 45, 60]) : rng.pick([0, 0, 15]),
      // Log-normal spread: a few large accounts, many small ones.
      sizeFactor: Math.exp(rng.normal(0, 0.6)) * (type === "PARTICULIER" ? 0.35 : 1),
      activity: Math.exp(rng.normal(0, 0.5)),
      categories: [rng.pick(categories), rng.pick(categories)],
    };
  });

  // ------------------------------------------------ invoice schedule (dates + clients)
  type Draft = { profile: ClientProfile; date: Date; lignes: DemoLine[]; duplicateOf?: Draft };
  const drafts: Draft[] = [];
  const perMonthBase = options.invoiceCount / options.months;
  for (let m = 0; m < options.months; m++) {
    const monthStart = atTen(start.getUTCFullYear(), start.getUTCMonth() + m, 1);
    const month = monthStart.getUTCMonth();
    const seasonality = month === 7 ? 0.7 : month === 11 ? 1.2 : 1;
    const growth = 0.85 + (0.3 * m) / Math.max(1, options.months - 1);
    const count = Math.max(1, Math.round(perMonthBase * seasonality * growth * (0.9 + rng.next() * 0.2)));
    const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), month + 1, 0)).getUTCDate();

    for (let k = 0; k < count; k++) {
      const date = atTen(monthStart.getUTCFullYear(), month, rng.int(1, daysInMonth));
      if (date > ref) continue;
      const eligible = profiles.filter((p) => p.client.createdAt <= date);
      if (eligible.length === 0) continue;
      const weights = Object.fromEntries(eligible.map((p, i) => [String(i), p.activity]));
      const profile = eligible[Number(rng.weighted(weights))];
      drafts.push({ profile, date, lignes: buildLines(rng, id, profile, products, catalogByProductId) });
    }
  }
  drafts.sort((a, b) => a.date.getTime() - b.date.getTime());

  // ------------------------------------------------ anomalies (applied before totals)
  const anomalies: { draft: Draft; type: AnomalyType; detail: string }[] = [];
  const anomalyCount = Math.round(drafts.length * options.anomalyRate);
  const anomalyTypes: AnomalyType[] = ["DUPLICATE", "WRONG_VAT", "AMOUNT_SPIKE", "ODD_DISCOUNT"];
  const touched = new Set<Draft>();
  for (let i = 0; i < anomalyCount; i++) {
    const type = anomalyTypes[i % anomalyTypes.length];
    let target: Draft;
    do target = rng.pick(drafts);
    while (touched.has(target));
    touched.add(target);

    if (type === "DUPLICATE") {
      const copy: Draft = {
        profile: target.profile,
        date: addDays(target.date, rng.int(0, 3)),
        lignes: target.lignes.map((l) => ({ ...l, id: id("lfa") })),
        duplicateOf: target,
      };
      if (copy.date > ref) copy.date = target.date;
      drafts.push(copy);
      touched.add(copy);
      anomalies.push({ draft: copy, type, detail: "Same client and lines as another invoice issued within 3 days" });
    } else {
      const line = rng.pick(target.lignes);
      if (type === "WRONG_VAT") {
        const expected = line.tauxTva;
        line.tauxTva = rng.pick([0, 29, 1.9]);
        anomalies.push({ draft: target, type, detail: `Line "${line.designation}" VAT ${line.tauxTva}% instead of ${expected}%` });
      } else if (type === "AMOUNT_SPIKE") {
        const factor = rng.int(10, 20);
        line.quantite = round3(line.quantite * factor);
        anomalies.push({ draft: target, type, detail: `Line "${line.designation}" quantity x${factor} vs usual` });
      } else {
        line.remisePct = rng.int(60, 90);
        anomalies.push({ draft: target, type, detail: `Line "${line.designation}" discount ${line.remisePct}%` });
      }
      const computed = calculerLigne(line);
      line.totalHT = computed.totalHT;
    }
  }
  drafts.sort((a, b) => a.date.getTime() - b.date.getTime());

  // ------------------------------------------------ numbering helper (chronological, per year)
  const lastNumber: Record<string, number> = {};
  const nextNumber = (type: "DEVIS" | "FACTURE" | "AVOIR", date: Date) => {
    const year = date.getUTCFullYear();
    const key = `${type}:${year}`;
    lastNumber[key] = (lastNumber[key] ?? 0) + 1;
    const prefix = type === "DEVIS" ? "DEV" : type === "FACTURE" ? "FAC" : "AV";
    return { numero: `${prefix}-${year}-${String(lastNumber[key]).padStart(4, "0")}`, annee: year };
  };

  // ------------------------------------------------ invoices + payments
  // Average invoice size per client, used for the "unusually large invoice" effect.
  const clientAverage = new Map<ClientProfile, number>();
  for (const d of drafts) {
    const ht = d.lignes.reduce((sum, l) => sum + l.totalHT, 0);
    const prev = clientAverage.get(d.profile);
    clientAverage.set(d.profile, prev === undefined ? ht : prev * 0.8 + ht * 0.2);
  }

  const invoices: DemoInvoice[] = [];
  const payments: DemoPayment[] = [];
  const invoiceTruth: InvoiceTruth[] = [];
  const invoiceByDraft = new Map<Draft, DemoInvoice>();
  const draftByInvoice = new Map<DemoInvoice, Draft>();

  for (const draft of drafts) {
    const { profile } = draft;
    const hasDueDate = !rng.chance(0.03);
    const termDays = profile.termDays;
    const dueDate = hasDueDate ? addDays(draft.date, termDays) : null;
    const effectiveDue = dueDate ?? addDays(draft.date, DEFAULT_TERM_DAYS);
    const timbre = rng.chance(0.95) ? 1 : 0;
    const totals = calculerTotaux(draft.lignes, timbre);
    const { numero, annee } = nextNumber("FACTURE", draft.date);

    const invoice: DemoInvoice = {
      id: id("fac"),
      numero,
      annee,
      dateEmission: draft.date,
      dateEcheance: dueDate,
      statut: "ENVOYEE",
      clientId: profile.client.id,
      devisOrigineId: null,
      sousTotalHT: totals.sousTotalHT,
      totalTva: totals.totalTva,
      timbreFiscal: timbre,
      totalTTC: totals.totalTTC,
      montantPaye: 0,
      lignes: draft.lignes,
    };
    invoiceByDraft.set(draft, invoice);
    draftByInvoice.set(invoice, draft);

    const daysToRef = (ref.getTime() - draft.date.getTime()) / DAY;
    const cancelled = !draft.duplicateOf && rng.chance(0.02);
    const pLate = lateProbability(profile.persona, {
      emission: draft.date,
      due: effectiveDue,
      amountRatio: totals.sousTotalHT / (clientAverage.get(profile) || totals.sousTotalHT),
      clientType: profile.client.type,
      termDays,
      clientAgeDays: (draft.date.getTime() - profile.client.createdAt.getTime()) / DAY,
    });

    let plannedDelay: number | null = null;
    let defaulted = false;
    if (cancelled) {
      invoice.statut = "ANNULEE";
    } else if (daysToRef < 5 && rng.chance(0.4)) {
      invoice.statut = "BROUILLON";
    } else if (rng.chance(DEFAULT_PROBABILITY[profile.persona])) {
      defaulted = true;
    } else {
      plannedDelay = rng.chance(pLate)
        ? LATE_THRESHOLD_DAYS + 1 + Math.round(rng.exponential(LATE_DELAY_MEAN[profile.persona]))
        : rng.int(-12, LATE_THRESHOLD_DAYS);
      let finalDate = addDays(effectiveDue, plannedDelay);
      if (finalDate <= draft.date) finalDate = addDays(draft.date, rng.int(1, 5));

      // ~15% of invoices (more often the large ones) are settled in 2-3 instalments.
      const instalments = rng.chance(totals.totalTTC > 5000 ? 0.3 : 0.1) ? rng.int(2, 3) : 1;
      const mode = pickPaymentMode(rng, profile.client.type);
      let remaining = totals.totalTTC;
      for (let k = 1; k <= instalments; k++) {
        const isLast = k === instalments;
        const fraction = instalments - k + 1;
        const montant = isLast ? round3(remaining) : round3((remaining / fraction) * (0.8 + rng.next() * 0.4));
        remaining = round3(remaining - montant);
        const span = (finalDate.getTime() - draft.date.getTime()) / DAY;
        const datePaiement = isLast ? finalDate : addDays(draft.date, Math.max(1, Math.round((span * k) / instalments)));
        if (datePaiement > ref) break; // not happened yet
        payments.push({
          id: id("pai"),
          factureId: invoice.id,
          datePaiement,
          montant,
          modePaiement: mode,
          reference: mode === "VIREMENT" ? `VIR-${rng.int(100000, 999999)}` : mode === "CHEQUE" ? `CHQ-${rng.int(1000000, 9999999)}` : null,
        });
        invoice.montantPaye = round3(invoice.montantPaye + montant);
      }
      if (invoice.montantPaye >= invoice.totalTTC) invoice.statut = "PAYEE";
      else if (invoice.montantPaye > 0) invoice.statut = "PARTIELLEMENT_PAYEE";
    }

    invoices.push(invoice);
    invoiceTruth.push({
      factureId: invoice.id,
      numero: invoice.numero,
      persona: profile.persona,
      trueLateProbability: round3(pLate),
      plannedDelayDays: plannedDelay,
      defaulted,
    });
  }

  // ------------------------------------------------ quotes (40% of invoices come from a quote)
  const quoteDrafts: { quote: Omit<DemoQuote, "numero" | "annee">; invoice?: DemoInvoice }[] = [];
  for (const invoice of invoices) {
    // Anomalous invoices get no quote, so each anomaly exists on exactly one document.
    if (touched.has(draftByInvoice.get(invoice)!) || !rng.chance(0.4)) continue;
    const date = addDays(invoice.dateEmission, -rng.int(3, 30));
    const lignes = invoice.lignes.map((l) => ({ ...l, id: id("ldv") }));
    const totals = calculerTotaux(lignes);
    quoteDrafts.push({
      quote: { id: id("dev"), dateEmission: date, dateValidite: addDays(date, 30), statut: "CONVERTI", clientId: invoice.clientId, lignes, ...totals },
      invoice,
    });
  }
  const extraQuotes = Math.round(invoices.length * 0.45);
  for (let i = 0; i < extraQuotes; i++) {
    const date = addDays(start, rng.int(0, Math.floor((ref.getTime() - start.getTime()) / DAY)));
    const eligible = profiles.filter((p) => p.client.createdAt <= date);
    if (eligible.length === 0) continue;
    const profile = rng.pick(eligible);
    const age = (ref.getTime() - date.getTime()) / DAY;
    const statut: DemoQuote["statut"] =
      age < 45
        ? rng.weighted({ ENVOYE: 45, BROUILLON: 20, ACCEPTE: 20, REFUSE: 15 })
        : rng.weighted({ REFUSE: 55, EXPIRE: 45 });
    const lignes = buildLines(rng, id, profile, products, catalogByProductId, "ldv");
    quoteDrafts.push({
      quote: { id: id("dev"), dateEmission: date, dateValidite: addDays(date, 30), statut, clientId: profile.client.id, lignes, ...calculerTotaux(lignes) },
    });
  }
  quoteDrafts.sort((a, b) => a.quote.dateEmission.getTime() - b.quote.dateEmission.getTime());
  const quotes: DemoQuote[] = quoteDrafts.map(({ quote, invoice }) => {
    const numbered = { ...quote, ...nextNumber("DEVIS", quote.dateEmission) };
    if (invoice) invoice.devisOrigineId = numbered.id;
    return numbered;
  });

  // ------------------------------------------------ credit notes (~3% of settled invoices)
  const creditDrafts: Omit<DemoCreditNote, "numero" | "annee">[] = [];
  for (const invoice of invoices) {
    if ((invoice.statut !== "PAYEE" && invoice.statut !== "PARTIELLEMENT_PAYEE") || !rng.chance(0.03)) continue;
    const date = addDays(invoice.dateEmission, rng.int(5, 40));
    if (date > ref) continue;
    const source = rng.pick(invoice.lignes);
    const quantite = Math.max(1, Math.round(source.quantite * (0.1 + rng.next() * 0.3)));
    const line = { quantite, prixUnitaireHT: source.prixUnitaireHT, tauxTva: source.tauxTva };
    const computed = calculerLigne(line);
    const totals = calculerTotaux([line]);
    creditDrafts.push({
      id: id("avo"),
      dateEmission: date,
      statut: rng.weighted({ APPLIQUE: 60, REMBOURSE: 30, EMIS: 10 }),
      motif: rng.pick(CREDIT_NOTE_REASONS),
      clientId: invoice.clientId,
      factureOrigineId: invoice.id,
      ...totals,
      lignes: [{ id: id("lav"), ordre: 0, designation: source.designation, quantite, prixUnitaireHT: source.prixUnitaireHT, tauxTva: source.tauxTva, totalHT: computed.totalHT, produitId: source.produitId }],
    });
  }
  creditDrafts.sort((a, b) => a.dateEmission.getTime() - b.dateEmission.getTime());
  const creditNotes: DemoCreditNote[] = creditDrafts.map((c) => ({ ...c, ...nextNumber("AVOIR", c.dateEmission) }));

  // ------------------------------------------------ result
  const numbering = Object.entries(lastNumber).map(([key, dernierNumero]) => {
    const [type, annee] = key.split(":");
    return { type: type as "DEVIS" | "FACTURE" | "AVOIR", annee: Number(annee), dernierNumero };
  });

  return {
    options,
    clients: profiles.map((p) => p.client),
    products,
    quotes,
    invoices,
    payments,
    creditNotes,
    numbering,
    truth: {
      clientPersonas: profiles.map((p) => ({ clientId: p.client.id, nom: p.client.nom, persona: p.persona })),
      invoices: invoiceTruth,
      anomalies: anomalies.map((a) => {
        const invoice = invoiceByDraft.get(a.draft)!;
        return { factureId: invoice.id, numero: invoice.numero, type: a.type, detail: a.detail };
      }),
    },
  };
}

function buildLines(
  rng: Random,
  id: (prefix: string) => string,
  profile: ClientProfile,
  products: DemoProduct[],
  catalogByProductId: Map<string, CatalogProduct>,
  prefix = "lfa",
): DemoLine[] {
  const count = rng.weighted({ "1": 35, "2": 30, "3": 22, "4": 13 });
  const lines: DemoLine[] = [];
  const used = new Set<string>();
  for (let i = 0; i < Number(count); i++) {
    const preferred = products.filter((p) => profile.categories.includes(p.categorie));
    const pool = rng.chance(0.8) && preferred.length > 0 ? preferred : products;
    const product = rng.pick(pool);
    if (used.has(product.id)) continue;
    used.add(product.id);

    const catalog = catalogByProductId.get(product.id)!;
    const [minQ, maxQ] = catalog.quantite;
    const raw = minQ + (maxQ - minQ) * Math.min(1, rng.next() * profile.sizeFactor);
    const quantite = Math.max(minQ, Math.round(raw));
    const remisePct = rng.chance(0.12) ? rng.int(5, 15) : 0;
    const computed = calculerLigne({ quantite, prixUnitaireHT: product.prixUnitaireHT, remisePct, tauxTva: product.tauxTva });
    lines.push({
      id: id(prefix),
      ordre: lines.length,
      designation: product.designation,
      quantite,
      prixUnitaireHT: product.prixUnitaireHT,
      remisePct,
      tauxTva: product.tauxTva,
      totalHT: computed.totalHT,
      produitId: product.id,
    });
  }
  return lines;
}

function pickPaymentMode(rng: Random, type: ClientType): ModePaiement {
  return type === "ENTREPRISE"
    ? rng.weighted<ModePaiement>({ VIREMENT: 60, CHEQUE: 35, ESPECES: 2, CARTE: 1, AUTRE: 2 })
    : rng.weighted<ModePaiement>({ ESPECES: 40, CARTE: 30, VIREMENT: 15, CHEQUE: 13, AUTRE: 2 });
}
