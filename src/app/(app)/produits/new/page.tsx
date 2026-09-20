import { ProduitForm } from "@/components/ProduitForm";
import { createProduit } from "@/lib/actions/produits";

export default function NewProduitPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Nouveau produit / service</h1>
      <ProduitForm action={createProduit} />
    </div>
  );
}
