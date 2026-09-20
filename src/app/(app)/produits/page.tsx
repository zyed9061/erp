import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMontant } from "@/lib/format";

export default async function ProduitsPage() {
  const produits = await prisma.produit.findMany({
    where: { actif: true },
    orderBy: { designation: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Produits & Services</h1>
        <Link
          href="/produits/new"
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Nouveau produit
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-normal">Reference</th>
              <th className="px-5 py-3 font-normal">Designation</th>
              <th className="px-5 py-3 font-normal">Type</th>
              <th className="px-5 py-3 font-normal">Prix HT</th>
              <th className="px-5 py-3 font-normal">TVA</th>
            </tr>
          </thead>
          <tbody>
            {produits.map((produit) => (
              <tr key={produit.id} className="border-t border-neutral-100">
                <td className="px-5 py-3 text-neutral-600">{produit.reference || "—"}</td>
                <td className="px-5 py-3">
                  <Link href={`/produits/${produit.id}`} className="text-neutral-900 hover:underline">
                    {produit.designation}
                  </Link>
                </td>
                <td className="px-5 py-3 text-neutral-600">
                  {produit.type === "SERVICE" ? "Service" : "Produit"}
                </td>
                <td className="px-5 py-3 text-neutral-600">
                  {formatMontant(Number(produit.prixUnitaireHT))}
                </td>
                <td className="px-5 py-3 text-neutral-600">{Number(produit.tauxTva)}%</td>
              </tr>
            ))}
            {produits.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-neutral-500">
                  Aucun produit pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
