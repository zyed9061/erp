// Donnees FICTIVES de demonstration : produits, devis, factures (avec paiements) et avoirs.
// Tout est marque "[DEMO]" / reference "DEMO-*" pour etre reconnu et supprime facilement.
// Idempotent : ne fait rien si des produits DEMO-* existent deja.
// Usage : npx tsx prisma/seed-demo.ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { calculerLigne, calculerTotaux } from "../src/lib/calculs";
import { attribuerCouleur, FAMILLE_PAR_ENTITE, type Entite } from "../src/lib/couleur";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MARQUE = "[DEMO] Donnees fictives - document de demonstration";
const jour = (iso: string) => new Date(`${iso}T09:00:00Z`);
const arrondir = (v: number) => Math.round(v * 1000) / 1000;

// --- Produits & services fictifs -------------------------------------------
const PRODUITS = [
  ["DEMO-SRV-001", "Audit informatique", "SERVICE", 450, "jour", 19],
  ["DEMO-SRV-002", "Maintenance mensuelle", "SERVICE", 180, "mois", 19],
  ["DEMO-SRV-003", "Formation utilisateurs", "SERVICE", 350, "session", 19],
  ["DEMO-SRV-004", "Developpement sur mesure", "SERVICE", 600, "jour", 19],
  ["DEMO-SRV-005", "Hebergement annuel", "SERVICE", 240, "an", 19],
  ["DEMO-SRV-006", "Support premium", "SERVICE", 90, "mois", 19],
  ["DEMO-PRD-001", "Ordinateur portable 15 pouces", "PRODUIT", 2450, "unite", 19],
  ["DEMO-PRD-002", "Ecran 27 pouces", "PRODUIT", 690, "unite", 19],
  ["DEMO-PRD-003", "Clavier sans fil", "PRODUIT", 85, "unite", 19],
  ["DEMO-PRD-004", "Imprimante laser", "PRODUIT", 520, "unite", 19],
  ["DEMO-PRD-005", "Ramette papier A4", "PRODUIT", 14.5, "boite", 7],
  ["DEMO-PRD-006", "Cable reseau 10 m", "PRODUIT", 22, "unite", 19],
] as const;

type Achat = [reference: string, quantite: number, remisePct?: number];

// --- Devis fictifs -----------------------------------------------------------
type DevisDemo = {
  cle: string;
  client: string;
  date: string;
  statut: "BROUILLON" | "ENVOYE" | "ACCEPTE" | "REFUSE" | "EXPIRE" | "CONVERTI";
  lignes: Achat[];
};
const DEVIS: DevisDemo[] = [
  { cle: "D1", client: "Atlas Conseil", date: "2026-04-06", statut: "CONVERTI", lignes: [["DEMO-SRV-001", 3], ["DEMO-SRV-002", 6]] },
  { cle: "D2", client: "Bleu Horizon SARL", date: "2026-04-21", statut: "ACCEPTE", lignes: [["DEMO-PRD-001", 4], ["DEMO-PRD-002", 4], ["DEMO-PRD-003", 4, 5]] },
  { cle: "D3", client: "Cactus Studio", date: "2026-05-12", statut: "REFUSE", lignes: [["DEMO-SRV-004", 10]] },
  { cle: "D4", client: "Delta Import", date: "2026-05-27", statut: "CONVERTI", lignes: [["DEMO-PRD-004", 2], ["DEMO-PRD-005", 10], ["DEMO-PRD-006", 6]] },
  { cle: "D5", client: "Eco Logistique", date: "2026-06-15", statut: "EXPIRE", lignes: [["DEMO-SRV-005", 1], ["DEMO-SRV-006", 12]] },
  { cle: "D6", client: "Fatma Ben Ali", date: "2026-07-03", statut: "ACCEPTE", lignes: [["DEMO-SRV-003", 2]] },
  { cle: "D7", client: "Global Tech", date: "2026-07-22", statut: "CONVERTI", lignes: [["DEMO-SRV-004", 8], ["DEMO-SRV-002", 12, 10]] },
  { cle: "D8", client: "Hedi Trabelsi", date: "2026-08-10", statut: "ENVOYE", lignes: [["DEMO-PRD-001", 1], ["DEMO-PRD-003", 1]] },
  { cle: "D9", client: "Atlas Conseil", date: "2026-08-29", statut: "BROUILLON", lignes: [["DEMO-SRV-001", 2]] },
  { cle: "D10", client: "Global Tech", date: "2026-09-12", statut: "ENVOYE", lignes: [["DEMO-SRV-005", 2], ["DEMO-SRV-006", 24]] },
];

// --- Factures fictives (paiements : part du TTC payee, en pourcentages) ------
type FactureDemo = {
  cle: string;
  client: string;
  date: string;
  echeanceJours: number;
  statut: "BROUILLON" | "ENVOYEE" | "PARTIELLEMENT_PAYEE" | "PAYEE" | "EN_RETARD" | "ANNULEE";
  lignes?: Achat[]; // sinon : reprises du devis `devis`
  devis?: string;
  paiements?: { part: number; date: string; mode: "VIREMENT" | "CHEQUE" | "ESPECES" | "CARTE"; ref?: string }[];
};
const FACTURES: FactureDemo[] = [
  { cle: "F1", client: "Atlas Conseil", date: "2026-04-15", echeanceJours: 30, statut: "PAYEE", devis: "D1", paiements: [{ part: 1, date: "2026-04-30", mode: "VIREMENT", ref: "VIR-DEMO-0415" }] },
  { cle: "F2", client: "Bleu Horizon SARL", date: "2026-05-04", echeanceJours: 30, statut: "PAYEE", lignes: [["DEMO-PRD-001", 2]], paiements: [{ part: 1, date: "2026-05-20", mode: "CHEQUE", ref: "CHQ-DEMO-7781" }] },
  { cle: "F3", client: "Delta Import", date: "2026-06-05", echeanceJours: 30, statut: "PAYEE", devis: "D4", paiements: [{ part: 0.3, date: "2026-06-06", mode: "VIREMENT", ref: "ACOMPTE-DEMO" }, { part: 0.7, date: "2026-06-28", mode: "VIREMENT", ref: "SOLDE-DEMO" }] },
  { cle: "F4", client: "Cactus Studio", date: "2026-06-10", echeanceJours: 30, statut: "PARTIELLEMENT_PAYEE", lignes: [["DEMO-SRV-002", 6]], paiements: [{ part: 0.4, date: "2026-06-25", mode: "CHEQUE", ref: "CHQ-DEMO-1042" }] },
  { cle: "F5", client: "Eco Logistique", date: "2026-06-28", echeanceJours: 30, statut: "EN_RETARD", lignes: [["DEMO-SRV-006", 6]] },
  { cle: "F6", client: "Fatma Ben Ali", date: "2026-07-08", echeanceJours: 15, statut: "PAYEE", lignes: [["DEMO-SRV-003", 1]], paiements: [{ part: 1, date: "2026-07-09", mode: "CARTE" }] },
  { cle: "F7", client: "Global Tech", date: "2026-08-01", echeanceJours: 45, statut: "PARTIELLEMENT_PAYEE", devis: "D7", paiements: [{ part: 0.5, date: "2026-08-12", mode: "VIREMENT", ref: "VIR-DEMO-0812" }] },
  { cle: "F8", client: "Hedi Trabelsi", date: "2026-09-01", echeanceJours: 30, statut: "ENVOYEE", lignes: [["DEMO-PRD-004", 1], ["DEMO-PRD-005", 5]] },
  { cle: "F9", client: "Atlas Conseil", date: "2026-08-18", echeanceJours: 30, statut: "PAYEE", lignes: [["DEMO-SRV-002", 3]], paiements: [{ part: 1, date: "2026-09-02", mode: "VIREMENT", ref: "VIR-DEMO-0902" }] },
  { cle: "F10", client: "Delta Import", date: "2026-09-05", echeanceJours: 30, statut: "ENVOYEE", lignes: [["DEMO-SRV-005", 1]] },
  { cle: "F11", client: "Bleu Horizon SARL", date: "2026-09-10", echeanceJours: 30, statut: "BROUILLON", lignes: [["DEMO-PRD-002", 2], ["DEMO-PRD-006", 4]] },
  { cle: "F12", client: "Eco Logistique", date: "2026-07-15", echeanceJours: 30, statut: "ANNULEE", lignes: [["DEMO-SRV-001", 1]] },
  { cle: "F13", client: "Cactus Studio", date: "2026-09-14", echeanceJours: 30, statut: "ENVOYEE", lignes: [["DEMO-SRV-002", 3]] },
  { cle: "F14", client: "Global Tech", date: "2026-09-17", echeanceJours: 30, statut: "BROUILLON", lignes: [["DEMO-SRV-006", 12]] },
];

// --- Avoirs fictifs -----------------------------------------------------------
const AVOIRS: { facture: string; date: string; motif: string; lignes: Achat[] }[] = [
  { facture: "F1", date: "2026-05-05", motif: "Remise commerciale apres livraison", lignes: [["DEMO-SRV-002", 1]] },
  { facture: "F6", date: "2026-07-20", motif: "Session de formation annulee", lignes: [["DEMO-SRV-003", 1]] },
  { facture: "F3", date: "2026-06-20", motif: "Retour de marchandise (cables defectueux)", lignes: [["DEMO-PRD-006", 2]] },
  { facture: "F7", date: "2026-08-20", motif: "Journee de developpement non realisee", lignes: [["DEMO-SRV-004", 1]] },
  { facture: "F9", date: "2026-09-01", motif: "Erreur de facturation", lignes: [["DEMO-SRV-002", 1]] },
];

async function prochainNumero(type: "DEVIS" | "FACTURE" | "AVOIR", annee: number, prefixe: string) {
  const rows = await prisma.$queryRaw<{ dernierNumero: number }[]>`
    INSERT INTO numbering_sequences (id, type, annee, "dernierNumero")
    VALUES (gen_random_uuid()::text, ${type}::"DocumentType", ${annee}, 1)
    ON CONFLICT (type, annee)
    DO UPDATE SET "dernierNumero" = numbering_sequences."dernierNumero" + 1
    RETURNING "dernierNumero"
  `;
  return `${prefixe}-${annee}-${String(rows[0].dernierNumero).padStart(4, "0")}`;
}

async function main() {
  if ((await prisma.produit.count({ where: { reference: { startsWith: "DEMO-" } } })) > 0) {
    console.log("Donnees de demonstration deja presentes (produits DEMO-*) : rien a faire.");
    return;
  }

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  const profil = await prisma.companyProfile.findFirst();
  const timbre = Number(profil?.tauxTimbreFiscal ?? 1);

  // Couleurs deja prises par section (pour attribuer des couleurs distinctes)
  const prises: Record<Entite, string[]> = { client: [], produit: [], devis: [], avoir: [], facture: [] };
  const [c, p, d, a, f] = await Promise.all([
    prisma.client.findMany({ select: { couleur: true } }),
    prisma.produit.findMany({ select: { couleur: true } }),
    prisma.devis.findMany({ select: { couleur: true } }),
    prisma.avoir.findMany({ select: { couleur: true } }),
    prisma.facture.findMany({ select: { couleur: true } }),
  ]);
  prises.client = c.flatMap((x) => (x.couleur ? [x.couleur] : []));
  prises.produit = p.flatMap((x) => (x.couleur ? [x.couleur] : []));
  prises.devis = d.flatMap((x) => (x.couleur ? [x.couleur] : []));
  prises.avoir = a.flatMap((x) => (x.couleur ? [x.couleur] : []));
  prises.facture = f.flatMap((x) => (x.couleur ? [x.couleur] : []));
  const couleur = (entite: Entite, graine: string) => {
    const choisie = attribuerCouleur(FAMILLE_PAR_ENTITE[entite], prises[entite], graine);
    prises[entite].push(choisie);
    return choisie;
  };

  // Produits
  const produits = new Map<string, Awaited<ReturnType<typeof prisma.produit.create>>>();
  for (const [reference, designation, type, prix, unite, tva] of PRODUITS) {
    produits.set(
      reference,
      await prisma.produit.create({
        data: {
          reference, designation, type, uniteMesure: unite, tauxTva: tva, prixUnitaireHT: prix,
          description: "Produit fictif (donnees de demonstration)",
          couleur: couleur("produit", reference),
        },
      }),
    );
  }

  // Clients (crees s'ils manquent : ce sont les clients fictifs @test.tn)
  const noms = [...new Set([...DEVIS.map((x) => x.client), ...FACTURES.map((x) => x.client)])];
  const clients = new Map<string, string>();
  for (const nom of noms) {
    const existant = await prisma.client.findFirst({ where: { nom } });
    if (existant) {
      clients.set(nom, existant.id);
      if (!existant.couleur) await prisma.client.update({ where: { id: existant.id }, data: { couleur: couleur("client", existant.id) } });
    } else {
      const cree = await prisma.client.create({
        data: { nom, type: "ENTREPRISE", email: `${nom.split(" ")[0].toLowerCase()}@test.tn`, ville: "Tunis", notes: MARQUE, couleur: couleur("client", nom) },
      });
      clients.set(nom, cree.id);
    }
  }

  const lignesDe = (achats: Achat[]) =>
    achats.map(([reference, quantite, remisePct = 0], ordre) => {
      const produit = produits.get(reference)!;
      const base = { quantite, prixUnitaireHT: Number(produit.prixUnitaireHT), remisePct, tauxTva: Number(produit.tauxTva) };
      return {
        ordre,
        designation: produit.designation,
        description: null,
        produitId: produit.id,
        ...base,
        totalHT: calculerLigne(base).totalHT,
      };
    });

  // Devis (par ordre chronologique => numeros sequentiels)
  const devisIds = new Map<string, string>();
  for (const dv of [...DEVIS].sort((x, y) => x.date.localeCompare(y.date))) {
    const lignes = lignesDe(dv.lignes);
    const totaux = calculerTotaux(lignes);
    const numero = await prochainNumero("DEVIS", 2026, "DEV");
    const cree = await prisma.devis.create({
      data: {
        numero, annee: 2026, statut: dv.statut, notes: MARQUE, conditions: "Validite 30 jours - paiement a 30 jours",
        dateEmission: jour(dv.date), createdAt: jour(dv.date),
        dateValidite: new Date(jour(dv.date).getTime() + 30 * 86_400_000),
        clientId: clients.get(dv.client)!, createdById: admin.id, couleur: couleur("devis", numero),
        ...totaux,
        lignes: { create: lignes.map(({ ordre, designation, description, produitId, quantite, prixUnitaireHT, remisePct, tauxTva, totalHT }) => ({ ordre, designation, description, produitId, quantite, prixUnitaireHT, remisePct, tauxTva, totalHT })) },
      },
    });
    devisIds.set(dv.cle, cree.id);
  }

  // Factures + paiements
  const factureIds = new Map<string, { id: string; clientId: string }>();
  for (const fa of [...FACTURES].sort((x, y) => x.date.localeCompare(y.date))) {
    const achats = fa.lignes ?? DEVIS.find((x) => x.cle === fa.devis)!.lignes;
    const lignes = lignesDe(achats);
    const totaux = calculerTotaux(lignes, timbre);
    const payes = (fa.paiements ?? []).map((pm) => ({ ...pm, montant: arrondir(totaux.totalTTC * pm.part) }));
    const totalPaye = arrondir(payes.reduce((s, pm) => s + pm.montant, 0));
    const numero = await prochainNumero("FACTURE", 2026, "FAC");
    const clientId = clients.get(fa.client)!;
    const cree = await prisma.facture.create({
      data: {
        numero, annee: 2026, statut: fa.statut, notes: MARQUE, conditionsPaiement: `Paiement a ${fa.echeanceJours} jours`,
        dateEmission: jour(fa.date), createdAt: jour(fa.date),
        dateEcheance: new Date(jour(fa.date).getTime() + fa.echeanceJours * 86_400_000),
        clientId, createdById: admin.id, couleur: couleur("facture", numero),
        devisOrigineId: fa.devis ? devisIds.get(fa.devis) : undefined,
        sousTotalHT: totaux.sousTotalHT, totalTva: totaux.totalTva, timbreFiscal: timbre, totalTTC: totaux.totalTTC,
        montantPaye: totalPaye,
        lignes: { create: lignes.map(({ ordre, designation, description, produitId, quantite, prixUnitaireHT, remisePct, tauxTva, totalHT }) => ({ ordre, designation, description, produitId, quantite, prixUnitaireHT, remisePct, tauxTva, totalHT })) },
        paiements: {
          create: payes.map((pm) => ({
            datePaiement: jour(pm.date), montant: pm.montant, modePaiement: pm.mode,
            reference: pm.ref ?? null, notes: MARQUE, createdById: admin.id,
          })),
        },
      },
    });
    factureIds.set(fa.cle, { id: cree.id, clientId });
  }

  // Avoirs
  for (const av of [...AVOIRS].sort((x, y) => x.date.localeCompare(y.date))) {
    const origine = factureIds.get(av.facture)!;
    const lignes = lignesDe(av.lignes);
    const totaux = calculerTotaux(lignes);
    const numero = await prochainNumero("AVOIR", 2026, "AV");
    await prisma.avoir.create({
      data: {
        numero, annee: 2026, motif: `${av.motif} ${MARQUE}`,
        dateEmission: jour(av.date), createdAt: jour(av.date),
        clientId: origine.clientId, factureOrigineId: origine.id, createdById: admin.id, couleur: couleur("avoir", numero),
        ...totaux,
        lignes: { create: lignes.map(({ ordre, designation, description, produitId, quantite, prixUnitaireHT, tauxTva, totalHT }) => ({ ordre, designation, description, produitId, quantite, prixUnitaireHT, tauxTva, totalHT })) },
      },
    });
  }

  console.log(
    `Donnees fictives creees : ${PRODUITS.length} produits, ${DEVIS.length} devis, ${FACTURES.length} factures, ${AVOIRS.length} avoirs.`,
  );
}

main().finally(() => prisma.$disconnect());
