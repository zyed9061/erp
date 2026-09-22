import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMontant, formatDate } from "@/lib/format";
import { StatutBadge } from "@/components/StatutBadge";
import { updateDevisStatut, convertirDevisEnFacture } from "@/lib/actions/devis";
import { CouleurPicker } from "@/components/CouleurPicker";
import { Pastille } from "@/components/Pastille";
import { styleCouleur } from "@/lib/couleur";
import { couleursDesAutres } from "@/lib/couleurs-serveur";

export default async function DevisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const devis = await prisma.devis.findUnique({
    where: { id },
    include: { client: true, lignes: true, facture: true },
  });

  if (!devis) {
    notFound();
  }

  const autres = await couleursDesAutres("devis", id);

  return (
    <div className="item-color space-y-6" style={styleCouleur("gris", devis.couleur, devis.id)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 border-l-4 border-l-(--item-color) pl-4">
          <Pastille texte="D" forme="carre" taille="lg" />
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">{devis.numero}</h1>
            <p className="text-sm text-neutral-500">{devis.client.nom}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatutBadge statut={devis.statut} />
          <a
            href={`/devis/${devis.id}/pdf`}
            target="_blank"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Voir le PDF
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {devis.statut === "BROUILLON" && (
          <StatusButton id={devis.id} statut="ENVOYE" label="Marquer comme envoye" />
        )}
        {devis.statut === "ENVOYE" && (
          <>
            <StatusButton id={devis.id} statut="ACCEPTE" label="Marquer comme accepte" />
            <StatusButton id={devis.id} statut="REFUSE" label="Marquer comme refuse" />
          </>
        )}
        {devis.statut === "ACCEPTE" && !devis.facture && (
          <form
            action={async () => {
              "use server";
              await convertirDevisEnFacture(devis.id);
            }}
          >
            <button
              type="submit"
              className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
            >
              Convertir en facture
            </button>
          </form>
        )}
        {devis.facture && (
          <Link
            href={`/factures/${devis.facture.id}`}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Voir la facture {devis.facture.numero}
          </Link>
        )}
      </div>

      <div className="max-w-xl">
        <CouleurPicker entite="devis" id={id} couleurActuelle={devis.couleur} autres={autres} />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-surface p-5 text-sm text-neutral-600">
        <div className="grid grid-cols-2 gap-2">
          <span>Date d&apos;emission: {formatDate(devis.dateEmission)}</span>
          {devis.dateValidite && <span>Valable jusqu&apos;au: {formatDate(devis.dateValidite)}</span>}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-surface">
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
            {devis.lignes.map((ligne) => (
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
          <span>{formatMontant(Number(devis.sousTotalHT))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">TVA</span>
          <span>{formatMontant(Number(devis.totalTva))}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-200 pt-1 font-medium text-neutral-900">
          <span>Total TTC</span>
          <span>{formatMontant(Number(devis.totalTTC))}</span>
        </div>
      </div>
    </div>
  );
}

function StatusButton({
  id,
  statut,
  label,
}: {
  id: string;
  statut: "ENVOYE" | "ACCEPTE" | "REFUSE";
  label: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await updateDevisStatut(id, statut);
      }}
    >
      <button
        type="submit"
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
      >
        {label}
      </button>
    </form>
  );
}
