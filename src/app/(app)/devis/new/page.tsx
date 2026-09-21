import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { DevisForm } from "@/components/DevisForm";
import { createDevis } from "@/lib/actions/devis";

export default async function NewDevisPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const [clients, produits] = await Promise.all([
    prisma.client.findMany({ where: { actif: true }, orderBy: { nom: "asc" } }),
    prisma.produit.findMany({ where: { actif: true }, orderBy: { designation: "asc" } }),
  ]);

  const produitOptions = produits.map((p) => ({
    id: p.id,
    designation: p.designation,
    prixUnitaireHT: Number(p.prixUnitaireHT),
    tauxTva: Number(p.tauxTva),
  }));

  return (
    <div className="space-y-3">
      <Breadcrumbs />
      <DevisForm
        action={createDevis}
        clients={clients}
        produits={produitOptions}
        defaultClientId={clientId}
      />
    </div>
  );
}
