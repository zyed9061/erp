import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { getLocale, getT } from "@/i18n/server";
import { ToastOnParam } from "@/components/ui/ToastOnParam";
import { formatMontant, formatDate } from "@/lib/format";
import { StatutBadge } from "@/components/StatutBadge";
import { PaiementForm } from "@/components/PaiementForm";
import { InvoiceInsights } from "@/components/ml/InvoiceInsights";
import { updateFactureStatut } from "@/lib/actions/factures";

export default async function FactureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const facture = await prisma.facture.findUnique({
    where: { id },
    include: {
      client: true,
      lignes: true,
      paiements: { orderBy: { datePaiement: "desc" } },
      avoirs: true,
      mlScore: true,
    },
  });

  if (!facture) {
    notFound();
  }

  const mlRun = facture.mlScore
    ? await prisma.mlModelRun.findUnique({
        where: { modelVersion: facture.mlScore.modelVersion },
        select: { modelVersion: true, trainedAt: true, demoData: true },
      })
    : null;

  const resteAPayer = Number(facture.totalTTC) - Number(facture.montantPaye);

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <ToastOnParam />
      </Suspense>
      <Breadcrumbs lastLabel={facture.numero} />
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
            {t("documents.viewPdf")}
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
              {t("invoices.actionMarkSent")}
            </button>
          </form>
        )}
        <Link
          href={`/avoirs/new?factureId=${facture.id}`}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          {t("invoices.actionCreateCreditNote")}
        </Link>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
        <div className="grid grid-cols-2 gap-2">
          <span>{t("documents.issueDateValue", { date: formatDate(facture.dateEmission, locale) })}</span>
          {facture.dateEcheance && (
            <span>{t("invoices.dueDateValue", { date: formatDate(facture.dateEcheance, locale) })}</span>
          )}
        </div>
      </div>

      <InvoiceInsights
        score={facture.mlScore}
        run={mlRun}
        statut={facture.statut}
        resteAPayer={Number(facture.totalTTC) - Number(facture.montantPaye)}
        t={t}
        locale={locale}
      />

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
            {facture.lignes.map((ligne) => (
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
          <span>{formatMontant(Number(facture.sousTotalHT), "TND", locale)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">{t("documents.vat")}</span>
          <span>{formatMontant(Number(facture.totalTva), "TND", locale)}</span>
        </div>
        {Number(facture.timbreFiscal) > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-500">{t("documents.stampDuty")}</span>
            <span>{formatMontant(Number(facture.timbreFiscal), "TND", locale)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-neutral-200 pt-1 font-medium text-neutral-900">
          <span>{t("documents.totalTTC")}</span>
          <span>{formatMontant(Number(facture.totalTTC), "TND", locale)}</span>
        </div>
        <div className="flex justify-between text-neutral-500">
          <span>{t("invoices.alreadyPaid")}</span>
          <span>{formatMontant(Number(facture.montantPaye), "TND", locale)}</span>
        </div>
        <div className="flex justify-between font-medium text-neutral-900">
          <span>{t("invoices.balance")}</span>
          <span>{formatMontant(resteAPayer, "TND", locale)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-neutral-900">{t("invoices.payments")}</h2>
          {facture.paiements.length === 0 ? (
            <p className="text-sm text-neutral-500">{t("invoices.noPayments")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {facture.paiements.map((p) => (
                <li key={p.id} className="flex justify-between border-b border-neutral-100 pb-2">
                  <span className="text-neutral-600">
                    {formatDate(p.datePaiement, locale)} — {t(`paymentMethods.${p.modePaiement}`)}
                  </span>
                  <span className="font-medium text-neutral-900">{formatMontant(Number(p.montant), "TND", locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {resteAPayer > 0 && facture.statut !== "ANNULEE" && (
          <PaiementForm factureId={facture.id} resteAPayer={resteAPayer} />
        )}
      </div>
    </div>
  );
}
