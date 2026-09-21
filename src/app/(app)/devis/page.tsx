import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { DevisGrid } from "./DevisGrid";
import type { DevisRow } from "./columns";

export default async function DevisListPage() {
  const [session, devis] = await Promise.all([
    auth(),
    prisma.devis.findMany({
      include: { client: true, facture: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const rows: DevisRow[] = devis.map((d) => ({
    id: d.id,
    numero: d.numero,
    clientNom: d.client.nom,
    clientEmail: d.client.email,
    dateEmission: d.dateEmission.toISOString(),
    dateValidite: d.dateValidite?.toISOString() ?? null,
    montantHT: Number(d.sousTotalHT),
    montantTTC: Number(d.totalTTC),
    statut: d.statut,
    updatedAt: d.updatedAt.toISOString(),
    hasFacture: Boolean(d.facture),
  }));

  return (
    <div>
      <PageHeader title="Devis" description="Suivez vos devis, de la creation a la conversion en facture." />
      <DevisGrid data={rows} userId={session?.user?.id} />
    </div>
  );
}
