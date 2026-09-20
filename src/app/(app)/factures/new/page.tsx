import { prisma } from "@/lib/prisma";
import { FactureForm } from "@/components/FactureForm";
import { createFacture } from "@/lib/actions/factures";

export default async function NewFacturePage() {
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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Nouvelle facture</h1>
      <FactureForm
        action={createFacture}
        clients={clients}
        produits={produitOptions}
        tauxTimbreFiscal={Number(companyProfile?.tauxTimbreFiscal ?? 1)}
      />
    </div>
  );
}
