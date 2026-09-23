import { z } from "zod";
import { zodResponsesFunction } from "openai/helpers/zod";
import type { Prisma } from "@/generated/prisma/client";
import { computeFactureDisplayStatut } from "@/lib/factureStatus";
import { aiDb } from "@/lib/ai/readonly-db";

/**
 * Outils (function calling) mis a disposition de l'assistant IA.
 * Chaque outil lit la base via `aiDb` (lecture seule) et renvoie uniquement
 * des donnees reelles, serialisees en JSON.
 */

// ---------------------------------------------------------------------------
// Regles metier partagees
// ---------------------------------------------------------------------------

/** Factures reellement emises : ni brouillon, ni annulee. */
const FACTURE_EMISE: Prisma.FactureWhereInput = { statut: { notIn: ["BROUILLON", "ANNULEE"] } };
/** Avoirs reellement emis : ni brouillon, ni annule. */
const AVOIR_EMIS: Prisma.AvoirWhereInput = { statut: { notIn: ["BROUILLON", "ANNULE"] } };

const LIMITE_DEFAUT = 10;
const LIMITE_MAX = 50;

class ToolInputError extends Error {}

function limite(value: number | null | undefined) {
  if (!value || value < 1) return LIMITE_DEFAUT;
  return Math.min(Math.floor(value), LIMITE_MAX);
}

function montant(value: Prisma.Decimal | number | null | undefined) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function jour(date: Date | null | undefined) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseJour(value: string | null | undefined, champ: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ToolInputError(`${champ} doit etre au format AAAA-MM-JJ.`);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) throw new ToolInputError(`${champ} est une date invalide.`);
  return date;
}

/** Filtre de periode inclusif [debut, fin] sur une colonne date. */
function periode(debut: string | null | undefined, fin: string | null | undefined) {
  const gte = parseJour(debut, "date_debut");
  const finJour = parseJour(fin, "date_fin");
  if (!gte && !finJour) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (gte) filter.gte = gte;
  if (finJour) {
    filter.lt = new Date(finJour.getFullYear(), finJour.getMonth(), finJour.getDate() + 1);
  }
  return filter;
}

function periodeEcho(debut: string | null | undefined, fin: string | null | undefined) {
  return { date_debut: debut ?? "toutes", date_fin: fin ?? "toutes" };
}

function clientNomFilter(nom: string | null | undefined) {
  return nom ? { nom: { contains: nom, mode: "insensitive" as const } } : undefined;
}

// ---------------------------------------------------------------------------
// Schemas communs
// ---------------------------------------------------------------------------

const dateDebut = z
  .string()
  .nullable()
  .describe("Date de debut incluse, format AAAA-MM-JJ. null = pas de borne.");
const dateFin = z
  .string()
  .nullable()
  .describe("Date de fin incluse, format AAAA-MM-JJ. null = pas de borne.");
const limiteSchema = z
  .number()
  .int()
  .nullable()
  .describe(`Nombre maximum de lignes a renvoyer (defaut ${LIMITE_DEFAUT}, max ${LIMITE_MAX}).`);
const clientNom = z
  .string()
  .nullable()
  .describe("Filtre sur le nom du client (recherche partielle, insensible a la casse). null = tous.");

// ---------------------------------------------------------------------------
// Definition des outils
// ---------------------------------------------------------------------------

const resumeActivite = {
  schema: z.object({ date_debut: dateDebut, date_fin: dateFin }),
  description:
    "Synthese financiere sur une periode : montant facture (factures emises, hors brouillons et annulees), montant encaisse (paiements recus), avoirs emis, et reste a encaisser actuel. A utiliser pour 'combien ai-je facture / encaisse'.",
  async run({ date_debut, date_fin }: { date_debut: string | null; date_fin: string | null }) {
    const dateEmission = periode(date_debut, date_fin);
    const datePaiement = periode(date_debut, date_fin);

    const [factures, paiements, paiementsParMode, avoirs, ouvertes] = await Promise.all([
      aiDb.facture.aggregate({
        where: { ...FACTURE_EMISE, dateEmission },
        _count: { _all: true },
        _sum: { sousTotalHT: true, totalTva: true, timbreFiscal: true, totalTTC: true },
      }),
      aiDb.paiement.aggregate({
        where: { datePaiement },
        _count: { _all: true },
        _sum: { montant: true },
      }),
      aiDb.paiement.groupBy({
        by: ["modePaiement"],
        where: { datePaiement },
        _sum: { montant: true },
        _count: { _all: true },
      }),
      aiDb.avoir.aggregate({
        where: { ...AVOIR_EMIS, dateEmission },
        _count: { _all: true },
        _sum: { totalTTC: true },
      }),
      aiDb.facture.findMany({
        where: { ...FACTURE_EMISE, statut: { notIn: ["BROUILLON", "ANNULEE", "PAYEE"] } },
        select: { totalTTC: true, montantPaye: true },
      }),
    ]);

    const resteAEncaisser = ouvertes.reduce(
      (sum, f) => sum + Math.max(0, Number(f.totalTTC) - Number(f.montantPaye)),
      0,
    );

    return {
      periode: periodeEcho(date_debut, date_fin),
      facture: {
        definition: "Factures emises (statut different de BROUILLON et ANNULEE), par date d'emission.",
        nombre_factures: factures._count._all,
        total_ht: montant(factures._sum.sousTotalHT),
        total_tva: montant(factures._sum.totalTva),
        total_timbre_fiscal: montant(factures._sum.timbreFiscal),
        total_ttc: montant(factures._sum.totalTTC),
      },
      encaisse: {
        definition: "Somme des paiements enregistres, par date de paiement.",
        nombre_paiements: paiements._count._all,
        total: montant(paiements._sum.montant),
        par_mode: paiementsParMode.map((p) => ({
          mode: p.modePaiement,
          nombre: p._count._all,
          total: montant(p._sum.montant),
        })),
      },
      avoirs: {
        definition: "Avoirs emis (hors BROUILLON et ANNULE), par date d'emission.",
        nombre: avoirs._count._all,
        total_ttc: montant(avoirs._sum.totalTTC),
      },
      reste_a_encaisser_actuel: {
        definition: "Total restant du aujourd'hui sur toutes les factures emises non payees (independant de la periode).",
        total: montant(resteAEncaisser),
      },
    };
  },
};

const FACTURE_STATUTS = ["BROUILLON", "ENVOYEE", "PARTIELLEMENT_PAYEE", "PAYEE", "EN_RETARD", "ANNULEE"] as const;

const listerFactures = {
  schema: z.object({
    statut: z
      .enum(FACTURE_STATUTS)
      .nullable()
      .describe("Filtrer sur un statut. EN_RETARD = echeance depassee et reste a payer. null = toutes les factures emises (hors brouillons et annulees)."),
    impayees_seulement: z
      .boolean()
      .describe("true = uniquement les factures emises avec un reste a payer > 0."),
    client_nom: clientNom,
    date_debut: dateDebut,
    date_fin: dateFin,
    tri: z
      .enum(["date_desc", "date_asc", "montant_desc", "montant_asc", "reste_desc", "echeance_asc"])
      .describe("Ordre de tri. montant = total TTC, reste = reste a payer."),
    limite: limiteSchema,
  }),
  description:
    "Liste les factures avec leurs montants (TTC, paye, reste a payer) et statut. Utile pour : factures impayees, en retard, facture la plus elevee, factures d'un client. Renvoie aussi le nombre total et les sommes de toutes les factures correspondantes (pas seulement celles affichees).",
  async run(args: {
    statut: (typeof FACTURE_STATUTS)[number] | null;
    impayees_seulement: boolean;
    client_nom: string | null;
    date_debut: string | null;
    date_fin: string | null;
    tri: "date_desc" | "date_asc" | "montant_desc" | "montant_asc" | "reste_desc" | "echeance_asc";
    limite: number | null;
  }) {
    const where: Prisma.FactureWhereInput = {
      dateEmission: periode(args.date_debut, args.date_fin),
      client: clientNomFilter(args.client_nom),
    };
    if (args.statut && args.statut !== "EN_RETARD") {
      where.statut = args.statut;
    } else {
      Object.assign(where, FACTURE_EMISE);
    }

    const rows = await aiDb.facture.findMany({
      where,
      select: {
        id: true,
        numero: true,
        statut: true,
        dateEmission: true,
        dateEcheance: true,
        totalTTC: true,
        montantPaye: true,
        client: { select: { nom: true } },
      },
    });

    let factures = rows.map((f) => {
      const totalTTC = montant(f.totalTTC);
      const montantPaye = montant(f.montantPaye);
      return {
        numero: f.numero,
        client: f.client.nom,
        date_emission: jour(f.dateEmission),
        date_echeance: jour(f.dateEcheance),
        statut: computeFactureDisplayStatut({ statut: f.statut, dateEcheance: f.dateEcheance, totalTTC, montantPaye }),
        total_ttc: totalTTC,
        montant_paye: montantPaye,
        reste_a_payer: montant(Math.max(0, totalTTC - montantPaye)),
        lien: `/factures/${f.id}`,
      };
    });

    if (args.statut === "EN_RETARD") factures = factures.filter((f) => f.statut === "EN_RETARD");
    if (args.impayees_seulement) {
      factures = factures.filter((f) => f.reste_a_payer > 0 && f.statut !== "BROUILLON" && f.statut !== "ANNULEE");
    }

    const sorters: Record<typeof args.tri, (a: (typeof factures)[number], b: (typeof factures)[number]) => number> = {
      date_desc: (a, b) => (b.date_emission ?? "").localeCompare(a.date_emission ?? ""),
      date_asc: (a, b) => (a.date_emission ?? "").localeCompare(b.date_emission ?? ""),
      montant_desc: (a, b) => b.total_ttc - a.total_ttc,
      montant_asc: (a, b) => a.total_ttc - b.total_ttc,
      reste_desc: (a, b) => b.reste_a_payer - a.reste_a_payer,
      echeance_asc: (a, b) => (a.date_echeance ?? "9999").localeCompare(b.date_echeance ?? "9999"),
    };
    factures.sort(sorters[args.tri]);

    const max = limite(args.limite);
    return {
      periode: periodeEcho(args.date_debut, args.date_fin),
      nombre_total: factures.length,
      somme_total_ttc: montant(factures.reduce((s, f) => s + f.total_ttc, 0)),
      somme_reste_a_payer: montant(factures.reduce((s, f) => s + f.reste_a_payer, 0)),
      affichees: Math.min(max, factures.length),
      factures: factures.slice(0, max),
    };
  },
};

const obtenirFacture = {
  schema: z.object({
    numero: z.string().describe("Numero exact de la facture (ex: FAC-2026-0001)."),
  }),
  description: "Detail complet d'une facture a partir de son numero : client, lignes, paiements, avoirs lies.",
  async run({ numero }: { numero: string }) {
    const f = await aiDb.facture.findUnique({
      where: { numero },
      select: {
        id: true,
        numero: true,
        statut: true,
        dateEmission: true,
        dateEcheance: true,
        sousTotalHT: true,
        totalTva: true,
        timbreFiscal: true,
        totalTTC: true,
        montantPaye: true,
        conditionsPaiement: true,
        client: { select: { nom: true } },
        lignes: {
          orderBy: { ordre: "asc" },
          select: { designation: true, quantite: true, prixUnitaireHT: true, remisePct: true, tauxTva: true, totalHT: true },
        },
        paiements: {
          orderBy: { datePaiement: "asc" },
          select: { datePaiement: true, montant: true, modePaiement: true, reference: true },
        },
        avoirs: { select: { numero: true, statut: true, totalTTC: true } },
      },
    });
    if (!f) return { trouve: false, message: `Aucune facture avec le numero ${numero}.` };

    const totalTTC = montant(f.totalTTC);
    const montantPaye = montant(f.montantPaye);
    return {
      trouve: true,
      numero: f.numero,
      client: f.client.nom,
      statut: computeFactureDisplayStatut({ statut: f.statut, dateEcheance: f.dateEcheance, totalTTC, montantPaye }),
      date_emission: jour(f.dateEmission),
      date_echeance: jour(f.dateEcheance),
      total_ht: montant(f.sousTotalHT),
      total_tva: montant(f.totalTva),
      timbre_fiscal: montant(f.timbreFiscal),
      total_ttc: totalTTC,
      montant_paye: montantPaye,
      reste_a_payer: montant(Math.max(0, totalTTC - montantPaye)),
      conditions_paiement: f.conditionsPaiement,
      lignes: f.lignes.map((l) => ({
        designation: l.designation,
        quantite: montant(l.quantite),
        prix_unitaire_ht: montant(l.prixUnitaireHT),
        remise_pct: montant(l.remisePct),
        taux_tva: montant(l.tauxTva),
        total_ht: montant(l.totalHT),
      })),
      paiements: f.paiements.map((p) => ({
        date: jour(p.datePaiement),
        montant: montant(p.montant),
        mode: p.modePaiement,
        reference: p.reference,
      })),
      avoirs: f.avoirs.map((a) => ({ numero: a.numero, statut: a.statut, total_ttc: montant(a.totalTTC) })),
      lien: `/factures/${f.id}`,
    };
  },
};

const topClients = {
  schema: z.object({
    critere: z
      .enum(["chiffre_affaires", "montant_paye", "reste_a_payer"])
      .describe("chiffre_affaires = total TTC facture ; montant_paye = deja regle sur ces factures ; reste_a_payer = encore du."),
    date_debut: dateDebut,
    date_fin: dateFin,
    limite: limiteSchema,
  }),
  description:
    "Classement des clients selon les factures emises (hors brouillons et annulees) sur la periode, par date d'emission. A utiliser pour 'mes meilleurs clients'.",
  async run(args: {
    critere: "chiffre_affaires" | "montant_paye" | "reste_a_payer";
    date_debut: string | null;
    date_fin: string | null;
    limite: number | null;
  }) {
    const groups = await aiDb.facture.groupBy({
      by: ["clientId"],
      where: { ...FACTURE_EMISE, dateEmission: periode(args.date_debut, args.date_fin) },
      _sum: { totalTTC: true, montantPaye: true },
      _count: { _all: true },
    });

    const ranked = groups
      .map((g) => {
        const ca = montant(g._sum.totalTTC);
        const paye = montant(g._sum.montantPaye);
        return {
          clientId: g.clientId,
          nombre_factures: g._count._all,
          chiffre_affaires_ttc: ca,
          montant_paye: paye,
          reste_a_payer: montant(Math.max(0, ca - paye)),
        };
      })
      .sort((a, b) => {
        const key = args.critere === "chiffre_affaires" ? "chiffre_affaires_ttc" : args.critere;
        return b[key] - a[key];
      })
      .slice(0, limite(args.limite));

    const clients = await aiDb.client.findMany({
      where: { id: { in: ranked.map((r) => r.clientId) } },
      select: { id: true, nom: true },
    });
    const noms = new Map(clients.map((c) => [c.id, c.nom]));

    return {
      periode: periodeEcho(args.date_debut, args.date_fin),
      critere: args.critere,
      nombre_clients_factures: groups.length,
      clients: ranked.map(({ clientId, ...rest }) => ({
        client: noms.get(clientId) ?? "(inconnu)",
        ...rest,
        lien: `/clients/${clientId}`,
      })),
    };
  },
};

const DEVIS_STATUTS = ["BROUILLON", "ENVOYE", "ACCEPTE", "REFUSE", "EXPIRE", "CONVERTI"] as const;

const statistiquesDevis = {
  schema: z.object({ date_debut: dateDebut, date_fin: dateFin }),
  description:
    "Nombre et montant des devis par statut (par date d'emission). Les devis 'en attente' sont ceux au statut BROUILLON ou ENVOYE (meme definition que le tableau de bord).",
  async run({ date_debut, date_fin }: { date_debut: string | null; date_fin: string | null }) {
    const groups = await aiDb.devis.groupBy({
      by: ["statut"],
      where: { dateEmission: periode(date_debut, date_fin) },
      _count: { _all: true },
      _sum: { totalTTC: true },
    });
    const parStatut = DEVIS_STATUTS.map((statut) => {
      const g = groups.find((x) => x.statut === statut);
      return { statut, nombre: g?._count._all ?? 0, total_ttc: montant(g?._sum.totalTTC) };
    });
    const enAttente = parStatut.filter((s) => s.statut === "BROUILLON" || s.statut === "ENVOYE");
    return {
      periode: periodeEcho(date_debut, date_fin),
      par_statut: parStatut,
      en_attente: {
        definition: "Devis au statut BROUILLON ou ENVOYE.",
        nombre: enAttente.reduce((s, x) => s + x.nombre, 0),
        total_ttc: montant(enAttente.reduce((s, x) => s + x.total_ttc, 0)),
      },
      nombre_total: parStatut.reduce((s, x) => s + x.nombre, 0),
    };
  },
};

const listerDevis = {
  schema: z.object({
    statut: z.enum(DEVIS_STATUTS).nullable().describe("Filtrer sur un statut. null = tous."),
    client_nom: clientNom,
    date_debut: dateDebut,
    date_fin: dateFin,
    tri: z.enum(["date_desc", "date_asc", "montant_desc", "montant_asc"]),
    limite: limiteSchema,
  }),
  description: "Liste les devis (numero, client, dates, statut, total TTC).",
  async run(args: {
    statut: (typeof DEVIS_STATUTS)[number] | null;
    client_nom: string | null;
    date_debut: string | null;
    date_fin: string | null;
    tri: "date_desc" | "date_asc" | "montant_desc" | "montant_asc";
    limite: number | null;
  }) {
    const where: Prisma.DevisWhereInput = {
      statut: args.statut ?? undefined,
      client: clientNomFilter(args.client_nom),
      dateEmission: periode(args.date_debut, args.date_fin),
    };
    const orderBy: Prisma.DevisOrderByWithRelationInput =
      args.tri === "date_asc"
        ? { dateEmission: "asc" }
        : args.tri === "montant_desc"
          ? { totalTTC: "desc" }
          : args.tri === "montant_asc"
            ? { totalTTC: "asc" }
            : { dateEmission: "desc" };

    const [total, rows] = await Promise.all([
      aiDb.devis.aggregate({ where, _count: { _all: true }, _sum: { totalTTC: true } }),
      aiDb.devis.findMany({
        where,
        orderBy,
        take: limite(args.limite),
        select: {
          id: true,
          numero: true,
          statut: true,
          dateEmission: true,
          dateValidite: true,
          totalTTC: true,
          client: { select: { nom: true } },
        },
      }),
    ]);

    return {
      periode: periodeEcho(args.date_debut, args.date_fin),
      nombre_total: total._count._all,
      somme_total_ttc: montant(total._sum.totalTTC),
      devis: rows.map((d) => ({
        numero: d.numero,
        client: d.client.nom,
        statut: d.statut,
        date_emission: jour(d.dateEmission),
        date_validite: jour(d.dateValidite),
        total_ttc: montant(d.totalTTC),
        lien: `/devis/${d.id}`,
      })),
    };
  },
};

const MODES_PAIEMENT = ["VIREMENT", "CHEQUE", "ESPECES", "CARTE", "AUTRE"] as const;

const listerPaiements = {
  schema: z.object({
    mode: z.enum(MODES_PAIEMENT).nullable().describe("Filtrer sur un mode de paiement. null = tous."),
    client_nom: clientNom,
    date_debut: dateDebut,
    date_fin: dateFin,
    limite: limiteSchema,
  }),
  description: "Liste les paiements recus (encaissements), du plus recent au plus ancien, avec le total de la selection.",
  async run(args: {
    mode: (typeof MODES_PAIEMENT)[number] | null;
    client_nom: string | null;
    date_debut: string | null;
    date_fin: string | null;
    limite: number | null;
  }) {
    const where: Prisma.PaiementWhereInput = {
      modePaiement: args.mode ?? undefined,
      datePaiement: periode(args.date_debut, args.date_fin),
      facture: args.client_nom ? { client: clientNomFilter(args.client_nom) } : undefined,
    };
    const [total, rows] = await Promise.all([
      aiDb.paiement.aggregate({ where, _count: { _all: true }, _sum: { montant: true } }),
      aiDb.paiement.findMany({
        where,
        orderBy: { datePaiement: "desc" },
        take: limite(args.limite),
        select: {
          datePaiement: true,
          montant: true,
          modePaiement: true,
          reference: true,
          facture: { select: { id: true, numero: true, client: { select: { nom: true } } } },
        },
      }),
    ]);
    return {
      periode: periodeEcho(args.date_debut, args.date_fin),
      nombre_total: total._count._all,
      total_encaisse: montant(total._sum.montant),
      paiements: rows.map((p) => ({
        date: jour(p.datePaiement),
        montant: montant(p.montant),
        mode: p.modePaiement,
        reference: p.reference,
        facture: p.facture.numero,
        client: p.facture.client.nom,
        lien: `/factures/${p.facture.id}`,
      })),
    };
  },
};

const AVOIR_STATUTS = ["BROUILLON", "EMIS", "APPLIQUE", "REMBOURSE", "ANNULE"] as const;

const listerAvoirs = {
  schema: z.object({
    statut: z
      .enum(AVOIR_STATUTS)
      .nullable()
      .describe("Filtrer sur un statut. null = avoirs emis (hors BROUILLON et ANNULE)."),
    client_nom: clientNom,
    date_debut: dateDebut,
    date_fin: dateFin,
    limite: limiteSchema,
  }),
  description: "Liste les avoirs (notes de credit) avec leur facture d'origine, motif et montant, et le total de la selection.",
  async run(args: {
    statut: (typeof AVOIR_STATUTS)[number] | null;
    client_nom: string | null;
    date_debut: string | null;
    date_fin: string | null;
    limite: number | null;
  }) {
    const where: Prisma.AvoirWhereInput = {
      ...(args.statut ? { statut: args.statut } : AVOIR_EMIS),
      client: clientNomFilter(args.client_nom),
      dateEmission: periode(args.date_debut, args.date_fin),
    };
    const [total, rows] = await Promise.all([
      aiDb.avoir.aggregate({ where, _count: { _all: true }, _sum: { totalTTC: true } }),
      aiDb.avoir.findMany({
        where,
        orderBy: { dateEmission: "desc" },
        take: limite(args.limite),
        select: {
          id: true,
          numero: true,
          statut: true,
          dateEmission: true,
          motif: true,
          totalTTC: true,
          client: { select: { nom: true } },
          factureOrigine: { select: { numero: true } },
        },
      }),
    ]);
    return {
      periode: periodeEcho(args.date_debut, args.date_fin),
      nombre_total: total._count._all,
      somme_total_ttc: montant(total._sum.totalTTC),
      avoirs: rows.map((a) => ({
        numero: a.numero,
        client: a.client.nom,
        statut: a.statut,
        date_emission: jour(a.dateEmission),
        facture_origine: a.factureOrigine.numero,
        motif: a.motif,
        total_ttc: montant(a.totalTTC),
        lien: `/avoirs/${a.id}`,
      })),
    };
  },
};

const rechercherClients = {
  schema: z.object({
    recherche: z
      .string()
      .nullable()
      .describe("Texte recherche dans le nom, l'email, la ville ou le matricule fiscal. null = tous."),
    actifs_seulement: z.boolean().describe("true = uniquement les clients actifs."),
    limite: limiteSchema,
  }),
  description:
    "Recherche des clients et renvoie leurs coordonnees ainsi que le total facture (factures emises) et le reste a payer de chacun.",
  async run(args: { recherche: string | null; actifs_seulement: boolean; limite: number | null }) {
    const q = args.recherche?.trim();
    const where: Prisma.ClientWhereInput = {
      actif: args.actifs_seulement ? true : undefined,
      OR: q
        ? [
            { nom: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { ville: { contains: q, mode: "insensitive" } },
            { matriculeFiscal: { contains: q, mode: "insensitive" } },
          ]
        : undefined,
    };
    const [nombreTotal, clients] = await Promise.all([
      aiDb.client.count({ where }),
      aiDb.client.findMany({
        where,
        orderBy: { nom: "asc" },
        take: limite(args.limite),
        select: {
          id: true,
          nom: true,
          type: true,
          email: true,
          telephone: true,
          ville: true,
          matriculeFiscal: true,
          actif: true,
        },
      }),
    ]);
    const totaux = await aiDb.facture.groupBy({
      by: ["clientId"],
      where: { ...FACTURE_EMISE, clientId: { in: clients.map((c) => c.id) } },
      _sum: { totalTTC: true, montantPaye: true },
      _count: { _all: true },
    });
    const parClient = new Map(totaux.map((t) => [t.clientId, t]));
    return {
      nombre_total: nombreTotal,
      clients: clients.map((c) => {
        const t = parClient.get(c.id);
        const ca = montant(t?._sum.totalTTC);
        const paye = montant(t?._sum.montantPaye);
        return {
          nom: c.nom,
          type: c.type,
          email: c.email,
          telephone: c.telephone,
          ville: c.ville,
          matricule_fiscal: c.matriculeFiscal,
          actif: c.actif,
          nombre_factures_emises: t?._count._all ?? 0,
          total_facture_ttc: ca,
          reste_a_payer: montant(Math.max(0, ca - paye)),
          lien: `/clients/${c.id}`,
        };
      }),
    };
  },
};

const rechercherProduits = {
  schema: z.object({
    recherche: z
      .string()
      .nullable()
      .describe("Texte recherche dans la designation, la reference ou la categorie. null = tous."),
    type: z.enum(["PRODUIT", "SERVICE"]).nullable().describe("Filtrer sur le type. null = tous."),
    actifs_seulement: z.boolean().describe("true = uniquement les produits actifs."),
    tri: z.enum(["designation", "prix_desc", "prix_asc", "stock_asc"]),
    limite: limiteSchema,
  }),
  description: "Recherche dans le catalogue produits/services : reference, prix HT, TVA, unite, stock.",
  async run(args: {
    recherche: string | null;
    type: "PRODUIT" | "SERVICE" | null;
    actifs_seulement: boolean;
    tri: "designation" | "prix_desc" | "prix_asc" | "stock_asc";
    limite: number | null;
  }) {
    const q = args.recherche?.trim();
    const where: Prisma.ProduitWhereInput = {
      type: args.type ?? undefined,
      actif: args.actifs_seulement ? true : undefined,
      OR: q
        ? [
            { designation: { contains: q, mode: "insensitive" } },
            { reference: { contains: q, mode: "insensitive" } },
            { categorie: { contains: q, mode: "insensitive" } },
          ]
        : undefined,
    };
    const orderBy: Prisma.ProduitOrderByWithRelationInput =
      args.tri === "prix_desc"
        ? { prixUnitaireHT: "desc" }
        : args.tri === "prix_asc"
          ? { prixUnitaireHT: "asc" }
          : args.tri === "stock_asc"
            ? { stock: { sort: "asc", nulls: "last" } }
            : { designation: "asc" };
    const [nombreTotal, produits] = await Promise.all([
      aiDb.produit.count({ where }),
      aiDb.produit.findMany({
        where,
        orderBy,
        take: limite(args.limite),
        select: {
          id: true,
          reference: true,
          designation: true,
          type: true,
          categorie: true,
          prixUnitaireHT: true,
          tauxTva: true,
          uniteMesure: true,
          stock: true,
          actif: true,
        },
      }),
    ]);
    return {
      nombre_total: nombreTotal,
      produits: produits.map((p) => ({
        reference: p.reference,
        designation: p.designation,
        type: p.type,
        categorie: p.categorie,
        prix_unitaire_ht: montant(p.prixUnitaireHT),
        taux_tva: montant(p.tauxTva),
        unite: p.uniteMesure,
        stock: p.stock,
        actif: p.actif,
        lien: `/produits/${p.id}`,
      })),
    };
  },
};

const produitsPlusVendus = {
  schema: z.object({
    critere: z.enum(["montant_ht", "quantite"]),
    date_debut: dateDebut,
    date_fin: dateFin,
    limite: limiteSchema,
  }),
  description:
    "Classement des produits/services les plus vendus d'apres les lignes des factures emises (hors brouillons et annulees) sur la periode.",
  async run(args: {
    critere: "montant_ht" | "quantite";
    date_debut: string | null;
    date_fin: string | null;
    limite: number | null;
  }) {
    const groups = await aiDb.ligneFacture.groupBy({
      by: ["designation"],
      where: { facture: { ...FACTURE_EMISE, dateEmission: periode(args.date_debut, args.date_fin) } },
      _sum: { totalHT: true, quantite: true },
      _count: { _all: true },
    });
    const ranked = groups
      .map((g) => ({
        designation: g.designation,
        nombre_lignes: g._count._all,
        quantite_totale: montant(g._sum.quantite),
        montant_ht_total: montant(g._sum.totalHT),
      }))
      .sort((a, b) =>
        args.critere === "quantite" ? b.quantite_totale - a.quantite_totale : b.montant_ht_total - a.montant_ht_total,
      );
    return {
      periode: periodeEcho(args.date_debut, args.date_fin),
      critere: args.critere,
      produits: ranked.slice(0, limite(args.limite)),
    };
  },
};

// ---------------------------------------------------------------------------
// Registre
// ---------------------------------------------------------------------------

type ToolDef = {
  schema: z.ZodType;
  description: string;
  // Les arguments sont valides par `schema` avant l'appel.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (args: any) => Promise<unknown>;
};

const TOOLS = {
  resume_activite: resumeActivite,
  lister_factures: listerFactures,
  obtenir_facture: obtenirFacture,
  top_clients: topClients,
  statistiques_devis: statistiquesDevis,
  lister_devis: listerDevis,
  lister_paiements: listerPaiements,
  lister_avoirs: listerAvoirs,
  rechercher_clients: rechercherClients,
  rechercher_produits: rechercherProduits,
  produits_plus_vendus: produitsPlusVendus,
} satisfies Record<string, ToolDef>;

export type AiToolName = keyof typeof TOOLS;

export function isAiToolName(name: string): name is AiToolName {
  return Object.prototype.hasOwnProperty.call(TOOLS, name);
}

/** Definitions envoyees a l'API OpenAI (function calling, mode strict). */
export const aiToolDefinitions = Object.entries(TOOLS).map(([name, tool]) =>
  zodResponsesFunction({ name, description: tool.description, parameters: tool.schema }),
);

/**
 * Execute un outil a partir des arguments JSON produits par le modele.
 * Renvoie toujours une chaine JSON (resultat ou erreur) a transmettre au modele.
 */
export async function runAiTool(name: string, rawArguments: string): Promise<string> {
  if (!isAiToolName(name)) {
    return JSON.stringify({ erreur: `Outil inconnu : ${name}` });
  }
  const tool: ToolDef = TOOLS[name];

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    return JSON.stringify({ erreur: "Arguments JSON invalides." });
  }
  const args = tool.schema.safeParse(parsed);
  if (!args.success) {
    return JSON.stringify({ erreur: "Arguments invalides.", details: z.prettifyError(args.error) });
  }

  try {
    return JSON.stringify(await tool.run(args.data));
  } catch (error) {
    if (error instanceof ToolInputError) {
      return JSON.stringify({ erreur: error.message });
    }
    console.error(`[assistant-ia] echec de l'outil ${name}`, error);
    return JSON.stringify({ erreur: "Erreur lors de la lecture des donnees. Aucune donnee disponible pour cette question." });
  }
}
