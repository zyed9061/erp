import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClientForm } from "@/components/ClientForm";
import { CouleurPicker } from "@/components/CouleurPicker";
import { updateClient } from "@/lib/actions/clients";
import { styleCouleur } from "@/lib/couleur";
import { couleursDesAutres } from "@/lib/couleurs-serveur";
import { Pastille } from "@/components/Pastille";

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

  const autres = await couleursDesAutres("client", id);

  const updateClientWithId = updateClient.bind(null, id);

  return (
    <div className="item-color space-y-6" style={styleCouleur("vert", client.couleur, client.id)}>
      <div className="flex items-center gap-4 border-l-4 border-l-(--item-color) pl-4">
        <Pastille texte={client.nom} taille="lg" />
        <h1 className="text-2xl font-semibold text-neutral-900">{client.nom}</h1>
      </div>

      <div className="max-w-xl">
        <CouleurPicker entite="client" id={id} couleurActuelle={client.couleur} autres={autres} />
      </div>

      <ClientForm action={updateClientWithId} client={client} />
    </div>
  );
}
