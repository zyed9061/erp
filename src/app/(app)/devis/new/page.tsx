import { prisma } from "@/lib/prisma";
import { DevisForm } from "@/components/DevisForm";
import { createDevis } from "@/lib/actions/devis";

export default async function NewDevisPage() {
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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Nouveau devis</h1>
      <DevisForm action={createDevis} clients={clients} produits={produitOptions} />
    </div>
  );
}
