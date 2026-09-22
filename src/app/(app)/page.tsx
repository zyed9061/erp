import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { joursAvantEcheance, statutEffectif } from "@/lib/facture-statut";
import {
  DashboardView,
  type DashboardData,
  type SuiviRow,
} from "@/components/dashboard/DashboardView";

const STATUTS_REPARTITION = [
  "BROUILLON",
  "ENVOYEE",
  "PARTIELLEMENT_PAYEE",
  "PAYEE",
  "EN_RETARD",
  "ANNULEE",
] as const;

const STATUT_LABELS: Record<string, string> = {
  BROUILLON: "Brouillon",
  ENVOYEE: "Envoyee",
  PARTIELLEMENT_PAYEE: "Partiellement payee",
  PAYEE: "Payee",
  EN_RETARD: "En retard",
  ANNULEE: "Annulee",
};

export default async function DashboardPage() {
  const now = new Date();
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);

  const [caduMois, facturesOuvertes, devisEnAttente, clientsActifs, facturesGraphiques] =
    await Promise.all([
      prisma.facture.aggregate({
        _sum: { totalTTC: true },
        where: { dateEmission: { gte: debutMois }, statut: { not: "ANNULEE" } },
      }),
      // EN_RETARD n'est jamais ecrit en base (il est derive), mais on le garde dans
      // le filtre pour les eventuelles lignes historiques qui le porteraient encore.
      prisma.facture.findMany({
        where: { statut: { in: ["ENVOYEE", "PARTIELLEMENT_PAYEE", "EN_RETARD"] } },
        include: { client: true },
        orderBy: { dateEcheance: "asc" },
      }),
      prisma.devis.count({ where: { statut: { in: ["BROUILLON", "ENVOYE"] } } }),
      prisma.client.count({ where: { actif: true } }),
      // Graphiques (repris de master) : CA des 6 derniers mois et repartition par statut.
      prisma.facture.findMany({
        select: {
          statut: true,
          dateEmission: true,
          dateEcheance: true,
          totalTTC: true,
          montantPaye: true,
        },
      }),
    ]);

  const totalImpaye = facturesOuvertes.reduce(
    (acc, f) => acc + (Number(f.totalTTC) - Number(f.montantPaye)),
    0,
  );

  // Les plus urgentes d'abord (retards en tete), puis on n'en garde que 5.
  const suivi: SuiviRow[] = facturesOuvertes
    .map((f) => {
      const totalTTC = Number(f.totalTTC);
      const montantPaye = Number(f.montantPaye);

      return {
        id: f.id,
        numero: f.numero,
        clientNom: f.client.nom,
        echeance: f.dateEcheance ? formatDate(f.dateEcheance) : null,
        joursRestants: joursAvantEcheance(f.dateEcheance, now),
        reste: totalTTC - montantPaye,
        statut: statutEffectif(
          { statut: f.statut, dateEcheance: f.dateEcheance, totalTTC, montantPaye },
          now,
        ),
      };
    })
    .sort((a, b) => {
      // Sans echeance : en dernier.
      if (a.joursRestants === null) return b.joursRestants === null ? 0 : 1;
      if (b.joursRestants === null) return -1;
      return a.joursRestants - b.joursRestants;
    })
    .slice(0, 5);

  const nbEnRetard = facturesOuvertes.filter((f) => {
    const jours = joursAvantEcheance(f.dateEcheance, now);
    return jours !== null && jours < 0 && Number(f.totalTTC) - Number(f.montantPaye) > 0;
  }).length;

  // Chiffre d'affaires des 6 derniers mois (hors factures annulees).
  const revenueByMonth = Array.from({ length: 6 }, (_, i) => {
    const debut = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const fin = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 1);
    const total = facturesGraphiques
      .filter((f) => f.statut !== "ANNULEE" && f.dateEmission >= debut && f.dateEmission < fin)
      .reduce((sum, f) => sum + Number(f.totalTTC), 0);
    return { label: debut.toLocaleDateString("fr-FR", { month: "short" }), total };
  });

  // Repartition par statut affiche (retard derive inclus).
  const statutsAffiches = facturesGraphiques.map((f) =>
    statutEffectif(
      {
        statut: f.statut,
        dateEcheance: f.dateEcheance,
        totalTTC: Number(f.totalTTC),
        montantPaye: Number(f.montantPaye),
      },
      now,
    ),
  );
  const statusCounts = STATUTS_REPARTITION.map((statut) => ({
    statut,
    label: STATUT_LABELS[statut],
    count: statutsAffiches.filter((s) => s === statut).length,
  }));

  const data: DashboardData = {
    caDuMois: Number(caduMois._sum.totalTTC ?? 0),
    totalImpaye,
    devisEnAttente,
    clientsActifs,
    suivi,
    nbOuvertes: facturesOuvertes.length,
    nbEnRetard,
    mois: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    revenueByMonth,
    statusCounts,
  };

  return <DashboardView data={data} />;
}
