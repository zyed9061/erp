import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { ToastOnParam } from "@/components/ui/ToastOnParam";
import { getT } from "@/i18n/server";
import { ProduitsGrid } from "./ProduitsGrid";
import type { ProduitRow } from "./columns";

export default async function ProduitsPage() {
  const [t, session, produits] = await Promise.all([
    getT(),
    auth(),
    prisma.produit.findMany({ orderBy: { designation: "asc" } }),
  ]);

  const rows: ProduitRow[] = produits.map((p) => {
    const prixUnitaireHT = Number(p.prixUnitaireHT);
    const tauxTva = Number(p.tauxTva);
    return {
      id: p.id,
      reference: p.reference,
      designation: p.designation,
      type: p.type,
      description: p.description,
      prixUnitaireHT,
      tauxTva,
      prixTTC: prixUnitaireHT * (1 + tauxTva / 100),
      uniteMesure: p.uniteMesure,
      categorie: p.categorie,
      stock: p.stock,
      actif: p.actif,
    };
  });

  return (
    <div>
      <Suspense fallback={null}>
        <ToastOnParam />
      </Suspense>
      <PageHeader title={t("products.title")} description={t("products.description")} />
      <ProduitsGrid data={rows} userId={session?.user?.id} />
    </div>
  );
}
