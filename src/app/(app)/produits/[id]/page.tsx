import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
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
    <div className="space-y-3">
      <Breadcrumbs lastLabel={produit.designation} />
      <ProduitForm action={updateProduitWithId} produit={produit} />
    </div>
  );
}
