import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CalendarDays, CalendarClock, Receipt, Wallet, Send, Undo2, CircleDollarSign } from "lucide-react";
import { DocumentHeader, InfoTile } from "@/components/layout/DocumentHeader";
import { TotalsCard } from "@/components/ui/TotalsCard";
import { FadeIn } from "@/components/motion/Motion";
import { getLocale, getT } from "@/i18n/server";
import { ToastOnParam } from "@/components/ui/ToastOnParam";
import { formatMontant, formatDate } from "@/lib/format";
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

      <DocumentHeader
        icon={Receipt}
        numero={facture.numero}
        subtitle={facture.client.nom}
        statut={facture.statut}
        pdfHref={`/factures/${facture.id}/pdf`}
        pdfLabel={t("documents.viewPdf")}
      >
        {facture.statut === "BROUILLON" && (
          <form
            action={async () => {
              "use server";
              await updateFactureStatut(facture.id, "ENVOYEE");
            }}
          >
            <button type="submit" className="btn-primary">
              <Send className="h-4 w-4" aria-hidden="true" />
              {t("invoices.actionMarkSent")}
            </button>
          </form>
        )}
        <Link href={`/avoirs/new?factureId=${facture.id}`} className="btn-secondary">
          <Undo2 className="h-4 w-4" aria-hidden="true" />
          {t("invoices.actionCreateCreditNote")}
        </Link>
      </DocumentHeader>

      <FadeIn delay={0.05} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InfoTile icon={CalendarDays} label={t("documents.issueDate")} value={formatDate(facture.dateEmission, locale)} />
        <InfoTile
          icon={CalendarClock}
          label={t("invoices.dueDate")}
          value={facture.dateEcheance ? formatDate(facture.dateEcheance, locale) : "-"}
        />
        <InfoTile
          icon={CircleDollarSign}
          label={t("documents.totalTTC")}
          value={formatMontant(Number(facture.totalTTC), "TND", locale)}
        />
        <InfoTile icon={Wallet} label={t("invoices.balance")} value={formatMontant(resteAPayer, "TND", locale)} />
      </FadeIn>

      <InvoiceInsights
        score={facture.mlScore}
        run={mlRun}
        statut={facture.statut}
        resteAPayer={resteAPayer}
        t={t}
        locale={locale}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:items-start">
        <FadeIn inView className="card overflow-hidden xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th>{t("documents.designation")}</th>
                  <th className="text-end!">{t("documents.quantity")}</th>
                  <th className="text-end!">{t("documents.priceHT")}</th>
                  <th className="text-end!">{t("documents.discount")}</th>
                  <th className="text-end!">{t("documents.vat")}</th>
                  <th className="text-end!">{t("documents.totalHT")}</th>
                </tr>
              </thead>
              <tbody>
                {facture.lignes.map((ligne) => (
                  <tr key={ligne.id}>
                    <td className="font-medium text-slate-900">{ligne.designation}</td>
                    <td className="text-end tabular-nums">{Number(ligne.quantite)}</td>
                    <td className="text-end whitespace-nowrap tabular-nums">
                      {formatMontant(Number(ligne.prixUnitaireHT), "TND", locale)}
                    </td>
                    <td className="text-end tabular-nums">{Number(ligne.remisePct)}%</td>
                    <td className="text-end tabular-nums">{Number(ligne.tauxTva)}%</td>
                    <td className="text-end font-medium whitespace-nowrap text-slate-900 tabular-nums">
                      {formatMontant(Number(ligne.totalHT), "TND", locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FadeIn>

        <FadeIn inView delay={0.08}>
          <TotalsCard className="xl:max-w-none"
            rows={[
              { label: t("documents.subtotalHT"), value: formatMontant(Number(facture.sousTotalHT), "TND", locale) },
              { label: t("documents.vat"), value: formatMontant(Number(facture.totalTva), "TND", locale) },
              ...(Number(facture.timbreFiscal) > 0
                ? [{ label: t("documents.stampDuty"), value: formatMontant(Number(facture.timbreFiscal), "TND", locale) }]
                : []),
              { label: t("documents.totalTTC"), value: formatMontant(Number(facture.totalTTC), "TND", locale), variant: "total" as const },
              { label: t("invoices.alreadyPaid"), value: formatMontant(Number(facture.montantPaye), "TND", locale) },
              { label: t("invoices.balance"), value: formatMontant(resteAPayer, "TND", locale), variant: "strong" as const },
            ]}
          />
        </FadeIn>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FadeIn inView className="card p-5 sm:p-6">
          <h2 className="section-title mb-4">{t("invoices.payments")}</h2>
          {facture.paiements.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
              <Wallet className="h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="text-sm text-slate-500">{t("invoices.noPayments")}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {facture.paiements.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                      <CircleDollarSign className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium text-slate-900">{t(`paymentMethods.${p.modePaiement}`)}</span>
                      <span className="block text-xs text-slate-500">{formatDate(p.datePaiement, locale)}</span>
                    </span>
                  </span>
                  <span className="text-sm font-semibold whitespace-nowrap text-emerald-700 tabular-nums">
                    +{formatMontant(Number(p.montant), "TND", locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </FadeIn>

        {resteAPayer > 0 && facture.statut !== "ANNULEE" && (
          <FadeIn inView delay={0.08}>
            <PaiementForm factureId={facture.id} resteAPayer={resteAPayer} />
          </FadeIn>
        )}
      </div>
    </div>
  );
}
