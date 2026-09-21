import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ClientForm } from "@/components/ClientForm";
import { updateClient } from "@/lib/actions/clients";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });

  if (!client) {
    notFound();
  }

  const updateClientWithId = updateClient.bind(null, id);

  return (
    <div className="space-y-3">
      <Breadcrumbs lastLabel={client.nom} />
      <ClientForm action={updateClientWithId} client={client} />
    </div>
  );
}
