import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProduitForm } from "@/components/ProduitForm";
import { updateProduit } from "@/lib/actions/produits";

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

  const updateProduitWithId = updateProduit.bind(null, id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">{produit.designation}</h1>
      <ProduitForm action={updateProduitWithId} produit={produit} />
    </div>
  );
}
