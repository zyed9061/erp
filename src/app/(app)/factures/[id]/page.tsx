import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMontant, formatDate } from "@/lib/format";
import { StatutBadge } from "@/components/StatutBadge";
import { updateFactureStatut, enregistrerPaiement } from "@/lib/actions/factures";

export default async function FactureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const facture = await prisma.facture.findUnique({
    where: { id },
    include: {
      client: true,
      lignes: true,
      paiements: { orderBy: { datePaiement: "desc" } },
      avoirs: true,
    },
  });

  if (!facture) {
    notFound();
  }

  const resteAPayer = Number(facture.totalTTC) - Number(facture.montantPaye);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{facture.numero}</h1>
          <p className="text-sm text-neutral-500">{facture.client.nom}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatutBadge statut={facture.statut} />
          <a
            href={`/factures/${facture.id}/pdf`}
            target="_blank"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Voir le PDF
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {facture.statut === "BROUILLON" && (
          <form
            action={async () => {
              "use server";
              await updateFactureStatut(facture.id, "ENVOYEE");
            }}
          >
            <button
              type="submit"
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Marquer comme envoyee
            </button>
          </form>
        )}
        <Link
          href={`/avoirs/new?factureId=${facture.id}`}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          Creer un avoir
        </Link>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
        <div className="grid grid-cols-2 gap-2">
          <span>Date d&apos;emission: {formatDate(facture.dateEmission)}</span>
          {facture.dateEcheance && <span>Echeance: {formatDate(facture.dateEcheance)}</span>}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-normal">Designation</th>
              <th className="px-4 py-2 font-normal">Qte</th>
              <th className="px-4 py-2 font-normal">Prix HT</th>
              <th className="px-4 py-2 font-normal">Remise</th>
              <th className="px-4 py-2 font-normal">TVA</th>
              <th className="px-4 py-2 font-normal">Total HT</th>
            </tr>
          </thead>
          <tbody>
            {facture.lignes.map((ligne) => (
              <tr key={ligne.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{ligne.designation}</td>
                <td className="px-4 py-2">{Number(ligne.quantite)}</td>
                <td className="px-4 py-2">{formatMontant(Number(ligne.prixUnitaireHT))}</td>
                <td className="px-4 py-2">{Number(ligne.remisePct)}%</td>
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
          <span>{formatMontant(Number(facture.sousTotalHT))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">TVA</span>
          <span>{formatMontant(Number(facture.totalTva))}</span>
        </div>
        {Number(facture.timbreFiscal) > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-500">Timbre fiscal</span>
            <span>{formatMontant(Number(facture.timbreFiscal))}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-neutral-200 pt-1 font-medium text-neutral-900">
          <span>Total TTC</span>
          <span>{formatMontant(Number(facture.totalTTC))}</span>
        </div>
        <div className="flex justify-between text-neutral-500">
          <span>Deja paye</span>
          <span>{formatMontant(Number(facture.montantPaye))}</span>
        </div>
        <div className="flex justify-between font-medium text-neutral-900">
          <span>Reste a payer</span>
          <span>{formatMontant(resteAPayer)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-neutral-900">Paiements</h2>
          {facture.paiements.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucun paiement enregistre.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {facture.paiements.map((p) => (
                <li key={p.id} className="flex justify-between border-b border-neutral-100 pb-2">
                  <span className="text-neutral-600">
                    {formatDate(p.datePaiement)} — {p.modePaiement}
                  </span>
                  <span className="font-medium text-neutral-900">{formatMontant(Number(p.montant))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {resteAPayer > 0 && facture.statut !== "ANNULEE" && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-medium text-neutral-900">Enregistrer un paiement</h2>
            <form action={enregistrerPaiement} className="space-y-3">
              <input type="hidden" name="factureId" value={facture.id} />
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm text-neutral-700">Date</span>
                  <input
                    type="date"
                    name="datePaiement"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-neutral-700">Montant</span>
                  <input
                    type="number"
                    step="0.001"
                    name="montant"
                    defaultValue={resteAPayer}
                    max={resteAPayer}
                    required
                    className="input"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm text-neutral-700">Mode de paiement</span>
                <select name="modePaiement" className="input">
                  <option value="VIREMENT">Virement</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="ESPECES">Especes</option>
                  <option value="CARTE">Carte</option>
                  <option value="AUTRE">Autre</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-neutral-700">Reference</span>
                <input name="reference" className="input" />
              </label>
              <button
                type="submit"
                className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Enregistrer le paiement
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
