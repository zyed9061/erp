import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProduitForm } from "@/components/ProduitForm";
import { CouleurPicker } from "@/components/CouleurPicker";
import { Pastille } from "@/components/Pastille";
import { updateProduit } from "@/lib/actions/produits";
import { styleCouleur } from "@/lib/couleur";
import { couleursDesAutres } from "@/lib/couleurs-serveur";

export default async function EditProduitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const produit = await prisma.produit.findUnique({ where: { id } });

  if (!produit) {
    notFound();
  }

  const autres = await couleursDesAutres("produit", id);
  const updateProduitWithId = updateProduit.bind(null, id);

  return (
    <div className="item-color space-y-6" style={styleCouleur("bleu", produit.couleur, produit.id)}>
      <div className="flex items-center gap-4 border-l-4 border-l-(--item-color) pl-4">
        <Pastille texte={produit.designation} taille="lg" />
        <h1 className="text-2xl font-semibold text-neutral-900">{produit.designation}</h1>
      </div>

      <div className="max-w-xl">
        <CouleurPicker entite="produit" id={id} couleurActuelle={produit.couleur} autres={autres} />
      </div>

      <ProduitForm action={updateProduitWithId} produit={produit} />
    </div>
  );
}
