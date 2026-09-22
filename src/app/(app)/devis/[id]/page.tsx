import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { getLocale, getT } from "@/i18n/server";
import { ToastOnParam } from "@/components/ui/ToastOnParam";
import { formatMontant, formatDate } from "@/lib/format";
import { StatutBadge } from "@/components/StatutBadge";
import { updateDevisStatut, convertirDevisEnFacture } from "@/lib/actions/devis";

export default async function DevisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const devis = await prisma.devis.findUnique({
    where: { id },
    include: { client: true, lignes: true, facture: true },
  });

  if (!devis) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <ToastOnParam />
      </Suspense>
      <Breadcrumbs lastLabel={devis.numero} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{devis.numero}</h1>
          <p className="text-sm text-neutral-500">{devis.client.nom}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatutBadge statut={devis.statut} />
          <a
            href={`/devis/${devis.id}/pdf`}
            target="_blank"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            {t("documents.viewPdf")}
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {devis.statut === "BROUILLON" && (
          <StatusButton id={devis.id} statut="ENVOYE" label={t("quotes.actionMarkSent")} />
        )}
        {devis.statut === "ENVOYE" && (
          <>
            <StatusButton id={devis.id} statut="ACCEPTE" label={t("quotes.actionMarkAccepted")} />
            <StatusButton id={devis.id} statut="REFUSE" label={t("quotes.actionMarkRefused")} />
          </>
        )}
        {devis.statut === "ACCEPTE" && !devis.facture && (
          <form
            action={async () => {
              "use server";
              const { id } = await convertirDevisEnFacture(devis.id);
              redirect(`/factures/${id}`);
            }}
          >
            <button
              type="submit"
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              {t("quotes.actionConvert")}
            </button>
          </form>
        )}
        {devis.facture && (
          <Link
            href={`/factures/${devis.facture.id}`}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            {t("quotes.viewInvoice", { number: devis.facture.numero })}
          </Link>
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
        <div className="grid grid-cols-2 gap-2">
          <span>{t("documents.issueDateValue", { date: formatDate(devis.dateEmission, locale) })}</span>
          {devis.dateValidite && (
            <span>{t("quotes.validUntilValue", { date: formatDate(devis.dateValidite, locale) })}</span>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-start text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-normal">{t("documents.designation")}</th>
              <th className="px-4 py-2 font-normal">{t("documents.quantity")}</th>
              <th className="px-4 py-2 font-normal">{t("documents.priceHT")}</th>
              <th className="px-4 py-2 font-normal">{t("documents.discount")}</th>
              <th className="px-4 py-2 font-normal">{t("documents.vat")}</th>
              <th className="px-4 py-2 font-normal">{t("documents.totalHT")}</th>
            </tr>
          </thead>
          <tbody>
            {devis.lignes.map((ligne) => (
              <tr key={ligne.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{ligne.designation}</td>
                <td className="px-4 py-2">{Number(ligne.quantite)}</td>
                <td className="px-4 py-2">{formatMontant(Number(ligne.prixUnitaireHT), "TND", locale)}</td>
                <td className="px-4 py-2">{Number(ligne.remisePct)}%</td>
                <td className="px-4 py-2">{Number(ligne.tauxTva)}%</td>
                <td className="px-4 py-2">{formatMontant(Number(ligne.totalHT), "TND", locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ms-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">{t("documents.subtotalHT")}</span>
          <span>{formatMontant(Number(devis.sousTotalHT), "TND", locale)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">{t("documents.vat")}</span>
          <span>{formatMontant(Number(devis.totalTva), "TND", locale)}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-200 pt-1 font-medium text-neutral-900">
          <span>{t("documents.totalTTC")}</span>
          <span>{formatMontant(Number(devis.totalTTC), "TND", locale)}</span>
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
