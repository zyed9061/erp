import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMontant, formatDate } from "@/lib/format";
import { StatutBadge } from "@/components/StatutBadge";

export default async function FacturesListPage() {
  const factures = await prisma.facture.findMany({
    include: { client: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Factures</h1>
        <Link
          href="/factures/new"
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Nouvelle facture
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-normal">Numero</th>
              <th className="px-5 py-3 font-normal">Client</th>
              <th className="px-5 py-3 font-normal">Date</th>
              <th className="px-5 py-3 font-normal">Total TTC</th>
              <th className="px-5 py-3 font-normal">Reste a payer</th>
              <th className="px-5 py-3 font-normal">Statut</th>
            </tr>
          </thead>
          <tbody>
            {factures.map((f) => (
              <tr key={f.id} className="border-t border-neutral-100">
                <td className="px-5 py-3">
                  <Link href={`/factures/${f.id}`} className="text-neutral-900 hover:underline">
                    {f.numero}
                  </Link>
                </td>
                <td className="px-5 py-3 text-neutral-600">{f.client.nom}</td>
                <td className="px-5 py-3 text-neutral-600">{formatDate(f.dateEmission)}</td>
                <td className="px-5 py-3 text-neutral-600">{formatMontant(Number(f.totalTTC))}</td>
                <td className="px-5 py-3 text-neutral-600">
                  {formatMontant(Number(f.totalTTC) - Number(f.montantPaye))}
                </td>
                <td className="px-5 py-3">
                  <StatutBadge statut={f.statut} />
                </td>
              </tr>
            ))}
            {factures.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-neutral-500">
                  Aucune facture pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
