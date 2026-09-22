import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { statutEffectif } from "@/lib/facture-statut";
import { FacturesView, type FactureRow } from "@/components/factures/FacturesView";

export default async function FacturesListPage() {
  const factures = await prisma.facture.findMany({
    include: { client: true },
    orderBy: { createdAt: "desc" },
  });

  // Un seul « maintenant » pour toute la page : sinon deux factures echues le
  // meme jour pourraient etre evaluees de part et d'autre de minuit.
  const maintenant = new Date();

  // Les Decimal Prisma et les Date ne traversent pas la frontiere client :
  // on serialise en nombres / chaines deja formatees.
  const rows: FactureRow[] = factures.map((f) => {
    const totalTTC = Number(f.totalTTC);
    const montantPaye = Number(f.montantPaye);

    return {
      id: f.id,
      numero: f.numero,
      clientNom: f.client.nom,
      clientEmail: f.client.email,
      dateEmission: formatDate(f.dateEmission),
      dateEcheance: f.dateEcheance ? formatDate(f.dateEcheance) : null,
      totalTTC,
      montantPaye,
      reste: totalTTC - montantPaye,
      // Le retard est derive de l'echeance, jamais lu depuis la base.
      statut: statutEffectif(
        { statut: f.statut, dateEcheance: f.dateEcheance, totalTTC, montantPaye },
        maintenant,
      ),
    };
  });

  return <FacturesView factures={rows} />;
}
