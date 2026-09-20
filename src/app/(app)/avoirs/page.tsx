import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMontant, formatDate } from "@/lib/format";

export default async function AvoirsListPage() {
  const avoirs = await prisma.avoir.findMany({
    include: { client: true, factureOrigine: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Avoirs</h1>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-normal">Numero</th>
              <th className="px-5 py-3 font-normal">Client</th>
              <th className="px-5 py-3 font-normal">Facture d&apos;origine</th>
              <th className="px-5 py-3 font-normal">Date</th>
              <th className="px-5 py-3 font-normal">Total TTC</th>
            </tr>
          </thead>
          <tbody>
            {avoirs.map((a) => (
              <tr key={a.id} className="border-t border-neutral-100">
                <td className="px-5 py-3">
                  <Link href={`/avoirs/${a.id}`} className="text-neutral-900 hover:underline">
                    {a.numero}
                  </Link>
                </td>
                <td className="px-5 py-3 text-neutral-600">{a.client.nom}</td>
                <td className="px-5 py-3 text-neutral-600">
                  <Link href={`/factures/${a.factureOrigine.id}`} className="hover:underline">
                    {a.factureOrigine.numero}
                  </Link>
                </td>
                <td className="px-5 py-3 text-neutral-600">{formatDate(a.dateEmission)}</td>
                <td className="px-5 py-3 text-neutral-600">{formatMontant(Number(a.totalTTC))}</td>
              </tr>
            ))}
            {avoirs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-neutral-500">
                  Aucun avoir pour le moment. Un avoir se cree depuis une facture.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
