import { prisma } from "@/lib/prisma";
import { ProduitsView, type ProduitRow } from "@/components/produits/ProduitsView";

export default async function ProduitsPage() {
  const produits = await prisma.produit.findMany({
    where: { actif: true },
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
  }));

  return <ProduitsView produits={rows} />;
}
