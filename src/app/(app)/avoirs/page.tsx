import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { getT } from "@/i18n/server";
import { AvoirsGrid } from "./AvoirsGrid";
import type { AvoirRow } from "./columns";

export default async function AvoirsListPage() {
  const [t, session, avoirs] = await Promise.all([
    getT(),
    auth(),
    prisma.avoir.findMany({
      include: { client: true, factureOrigine: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const rows: AvoirRow[] = avoirs.map((a) => ({
    id: a.id,
    numero: a.numero,
    clientNom: a.client.nom,
    factureNumero: a.factureOrigine.numero,
    factureId: a.factureOrigine.id,
    dateEmission: a.dateEmission.toISOString(),
    motif: a.motif,
    montantHT: Number(a.sousTotalHT),
    taxes: Number(a.totalTva),
    montantTTC: Number(a.totalTTC),
    statut: a.statut,
  }));

  return (
    <div>
      <PageHeader title={t("creditNotes.title")} description={t("creditNotes.description")} />
      <AvoirsGrid data={rows} userId={session?.user?.id} />
    </div>
  );
}
