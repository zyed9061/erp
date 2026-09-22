import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { DevisView, type DevisRow } from "@/components/devis/DevisView";

export default async function DevisListPage() {
  const devis = await prisma.devis.findMany({
    include: { client: true },
    orderBy: { createdAt: "desc" },
  });

  // Les Decimal Prisma et les Date ne traversent pas la frontiere client :
  // on serialise en nombres / chaines deja formatees.
  const rows: DevisRow[] = devis.map((d) => ({
    id: d.id,
    numero: d.numero,
    clientNom: d.client.nom,
    dateEmission: formatDate(d.dateEmission),
    dateValidite: d.dateValidite ? formatDate(d.dateValidite) : null,
    totalTTC: Number(d.totalTTC),
    statut: d.statut,
  }));

  return <DevisView devis={rows} />;
}
