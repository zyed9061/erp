import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { ToastOnParam } from "@/components/ui/ToastOnParam";
import { getT } from "@/i18n/server";
import { ClientsGrid } from "./ClientsGrid";
import type { ClientRow } from "./columns";

export default async function ClientsPage() {
  const [t, session, clients] = await Promise.all([
    getT(),
    auth(),
    prisma.client.findMany({
      orderBy: { nom: "asc" },
      include: {
        factures: {
          select: { totalTTC: true, montantPaye: true, dateEmission: true },
        },
        mlSegment: { select: { segment: true } },
      },
    }),
  ]);

  const rows: ClientRow[] = clients.map((client) => {
    const totalFacture = client.factures.reduce((sum, f) => sum + Number(f.totalTTC), 0);
    const soldeDu = client.factures.reduce(
      (sum, f) => sum + (Number(f.totalTTC) - Number(f.montantPaye)),
      0,
    );
    const derniereFacture = client.factures.length
      ? client.factures
          .map((f) => f.dateEmission)
          .sort((a, b) => b.getTime() - a.getTime())[0]
          .toISOString()
      : null;

    return {
      id: client.id,
      nom: client.nom,
      type: client.type,
      email: client.email,
      telephone: client.telephone,
      ville: client.ville,
      pays: client.pays,
      totalFacture,
      soldeDu,
      derniereFacture,
      actif: client.actif,
      segment: client.mlSegment?.segment ?? null,
    };
  });

  return (
    <div>
      <Suspense fallback={null}>
        <ToastOnParam />
      </Suspense>
      <PageHeader title={t("clients.title")} description={t("clients.description")} />
      <ClientsGrid data={rows} userId={session?.user?.id} />
    </div>
  );
}
