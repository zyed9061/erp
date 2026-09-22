import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { ToastOnParam } from "@/components/ui/ToastOnParam";
import { ProduitsView, type ProduitRow } from "@/components/produits/ProduitsView";

export default async function ProduitsPage() {
  // References desactivees incluses : elles restent consultables (et reactivables).
  const produits = await prisma.produit.findMany({
    orderBy: { designation: "asc" },
  });

  // Les Decimal Prisma ne traversent pas la frontiere client : on serialise.
  const rows: ProduitRow[] = produits.map((p) => ({
    id: p.id,
    reference: p.reference,
    designation: p.designation,
    type: p.type,
    prixUnitaireHT: Number(p.prixUnitaireHT),
    tauxTva: Number(p.tauxTva),
    categorie: p.categorie,
    actif: p.actif,
  }));

  return (
    <>
      <Suspense fallback={null}>
        <ToastOnParam />
      </Suspense>
      <ProduitsView
        produits={rows.filter((p) => p.actif)}
        archives={rows.filter((p) => !p.actif)}
      />
    </>
  );
}
