import { prisma } from "@/lib/prisma";
import { ClientsView, type ClientRow } from "@/components/clients/ClientsView";

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    where: { actif: true },
    orderBy: { nom: "asc" },
  });

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    nom: c.nom,
    type: c.type,
    email: c.email,
    telephone: c.telephone,
    ville: c.ville,
  }));

  return <ClientsView clients={rows} />;
}
