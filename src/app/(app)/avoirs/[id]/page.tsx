import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMontant, formatDate } from "@/lib/format";

export default async function AvoirDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const avoir = await prisma.avoir.findUnique({
    where: { id },
    include: { client: true, lignes: true, factureOrigine: true },
  });

  if (!avoir) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{avoir.numero}</h1>
          <p className="text-sm text-neutral-500">
            {avoir.client.nom} — Avoir sur la facture{" "}
            <Link href={`/factures/${avoir.factureOrigine.id}`} className="hover:underline">
              {avoir.factureOrigine.numero}
            </Link>
          </p>
        </div>
        <a
          href={`/avoirs/${avoir.id}/pdf`}
          target="_blank"
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          Voir le PDF
        </a>
      </div>

      {avoir.motif && (
        <div className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
          <strong className="text-neutral-900">Motif: </strong>
          {avoir.motif}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-normal">Designation</th>
              <th className="px-4 py-2 font-normal">Qte</th>
              <th className="px-4 py-2 font-normal">Prix HT</th>
              <th className="px-4 py-2 font-normal">TVA</th>
              <th className="px-4 py-2 font-normal">Total HT</th>
            </tr>
          </thead>
          <tbody>
            {avoir.lignes.map((ligne) => (
              <tr key={ligne.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{ligne.designation}</td>
                <td className="px-4 py-2">{Number(ligne.quantite)}</td>
                <td className="px-4 py-2">{formatMontant(Number(ligne.prixUnitaireHT))}</td>
                <td className="px-4 py-2">{Number(ligne.tauxTva)}%</td>
                <td className="px-4 py-2">{formatMontant(Number(ligne.totalHT))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Sous-total HT</span>
          <span>{formatMontant(Number(avoir.sousTotalHT))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">TVA</span>
          <span>{formatMontant(Number(avoir.totalTva))}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-200 pt-1 font-medium text-neutral-900">
          <span>Total TTC</span>
          <span>{formatMontant(Number(avoir.totalTTC))}</span>
        </div>
      </div>

      <p className="text-xs text-neutral-400">Emis le {formatDate(avoir.dateEmission)}</p>
    </div>
  );
}
