import { prisma } from "@/lib/prisma";
import { AvoirForm } from "@/components/AvoirForm";
import { createAvoir } from "@/lib/actions/avoirs";

export default async function NewAvoirPage({
  searchParams,
}: {
  searchParams: Promise<{ factureId?: string }>;
}) {
  const { factureId } = await searchParams;

  const [factures, produits] = await Promise.all([
    prisma.facture.findMany({
      where: { statut: { not: "ANNULEE" } },
      include: { client: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.produit.findMany({ where: { actif: true }, orderBy: { designation: "asc" } }),
  ]);

  const factureOptions = factures.map((f) => ({ id: f.id, numero: f.numero, clientNom: f.client.nom }));
  const produitOptions = produits.map((p) => ({
    id: p.id,
    designation: p.designation,
    prixUnitaireHT: Number(p.prixUnitaireHT),
    tauxTva: Number(p.tauxTva),
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Nouvel avoir</h1>
      <AvoirForm
        action={createAvoir}
        factures={factureOptions}
        produits={produitOptions}
        factureIdParDefaut={factureId}
      />
    </div>
  );
}
