import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { getLocale } from "@/i18n/server";
import { AvoirsView, type AvoirRow } from "@/components/avoirs/AvoirsView";

export default async function AvoirsListPage() {
  const locale = await getLocale();
  const avoirs = await prisma.avoir.findMany({
    include: { client: true, factureOrigine: true },
    orderBy: { createdAt: "desc" },
  });

  // Les Decimal Prisma et les Date ne traversent pas la frontiere client :
  // on serialise en nombres / chaines deja formatees.
  const rows: AvoirRow[] = avoirs.map((a) => ({
    id: a.id,
    numero: a.numero,
    clientNom: a.client.nom,
    factureId: a.factureOrigine.id,
    factureNumero: a.factureOrigine.numero,
    dateEmission: formatDate(a.dateEmission, locale),
    motif: a.motif,
    totalTTC: Number(a.totalTTC),
    statut: a.statut,
  }));

  return <AvoirsView avoirs={rows} />;
}
