import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { ToastOnParam } from "@/components/ui/ToastOnParam";
import { ClientsView, type ClientRow } from "@/components/clients/ClientsView";

export default async function ClientsPage() {
  // Archives inclus : ils restent consultables (et reactivables) depuis la liste.
  const clients = await prisma.client.findMany({
    orderBy: { nom: "asc" },
  });

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    nom: c.nom,
    type: c.type,
    email: c.email,
    telephone: c.telephone,
    ville: c.ville,
    actif: c.actif,
  }));

  return (
    <>
      <Suspense fallback={null}>
        <ToastOnParam />
      </Suspense>
      <ClientsView
        clients={rows.filter((c) => c.actif)}
        archives={rows.filter((c) => !c.actif)}
      />
    </>
  );
}
