import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { getLocale } from "@/i18n/server";
import { DevisView, type DevisRow } from "@/components/devis/DevisView";

export default async function DevisListPage() {
  const locale = await getLocale();
  const devis = await prisma.devis.findMany({
    include: { client: true, facture: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Les Decimal Prisma et les Date ne traversent pas la frontiere client :
  // on serialise en nombres / chaines deja formatees.
  const rows: DevisRow[] = devis.map((d) => ({
    id: d.id,
    numero: d.numero,
    clientNom: d.client.nom,
    clientEmail: d.client.email,
    dateEmission: formatDate(d.dateEmission, locale),
    dateValidite: d.dateValidite ? formatDate(d.dateValidite, locale) : null,
    totalTTC: Number(d.totalTTC),
    statut: d.statut,
    hasFacture: Boolean(d.facture),
  }));

  return <DevisView devis={rows} />;
}
