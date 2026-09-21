import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { FactureForm } from "@/components/FactureForm";
import { createFacture } from "@/lib/actions/factures";

export default async function NewFacturePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const [clients, produits, companyProfile] = await Promise.all([
    prisma.client.findMany({ where: { actif: true }, orderBy: { nom: "asc" } }),
    prisma.produit.findMany({ where: { actif: true }, orderBy: { designation: "asc" } }),
    prisma.companyProfile.findFirst(),
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
      <FactureForm
        action={createFacture}
        clients={clients}
        produits={produitOptions}
        tauxTimbreFiscal={Number(companyProfile?.tauxTimbreFiscal ?? 1)}
        defaultClientId={clientId}
      />
    </div>
  );
}
