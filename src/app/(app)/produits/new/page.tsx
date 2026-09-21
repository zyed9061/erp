import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ProduitForm } from "@/components/ProduitForm";
import { createProduit } from "@/lib/actions/produits";

export default function NewProduitPage() {
  return (
    <div className="space-y-3">
      <Breadcrumbs />
      <ProduitForm action={createProduit} />
    </div>
  );
}
