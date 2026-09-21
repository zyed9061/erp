import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { computeFactureDisplayStatut } from "@/lib/factureStatus";
import { FacturesGrid } from "./FacturesGrid";
import type { FactureRow } from "./columns";

export default async function FacturesListPage() {
  const [session, factures] = await Promise.all([
    auth(),
    prisma.facture.findMany({
      include: { client: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const rows: FactureRow[] = factures.map((f) => {
    const montantTTC = Number(f.totalTTC);
    const montantPaye = Number(f.montantPaye);
    return {
      id: f.id,
      numero: f.numero,
      clientNom: f.client.nom,
      clientEmail: f.client.email,
      dateEmission: f.dateEmission.toISOString(),
      dateEcheance: f.dateEcheance?.toISOString() ?? null,
      montantHT: Number(f.sousTotalHT),
      taxes: Number(f.totalTva) + Number(f.timbreFiscal),
      montantTTC,
      montantPaye,
      resteAPayer: montantTTC - montantPaye,
      statut: computeFactureDisplayStatut({
        statut: f.statut,
        dateEcheance: f.dateEcheance,
        totalTTC: montantTTC,
        montantPaye,
      }),
    };
  });

  return (
    <div>
      <PageHeader title="Factures" description="Suivez la facturation et les encaissements de vos clients." />
      <FacturesGrid data={rows} userId={session?.user?.id} />
    </div>
  );
}
