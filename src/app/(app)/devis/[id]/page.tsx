import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ArrowRightLeft, CalendarDays, CalendarClock, CircleDollarSign, FileText, Receipt } from "lucide-react";
import { DocumentHeader, InfoTile } from "@/components/layout/DocumentHeader";
import { TotalsCard } from "@/components/ui/TotalsCard";
import { FadeIn } from "@/components/motion/Motion";
import { getLocale, getT } from "@/i18n/server";
import { ToastOnParam } from "@/components/ui/ToastOnParam";
import { formatMontant, formatDate } from "@/lib/format";
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

      <DocumentHeader
        icon={FileText}
        numero={devis.numero}
        subtitle={devis.client.nom}
        statut={devis.statut}
        pdfHref={`/devis/${devis.id}/pdf`}
        pdfLabel={t("documents.viewPdf")}
      >
        {devis.statut === "BROUILLON" && (
          <StatusButton id={devis.id} statut="ENVOYE" label={t("quotes.actionMarkSent")} primary />
        )}
        {devis.statut === "ENVOYE" && (
          <>
            <StatusButton id={devis.id} statut="ACCEPTE" label={t("quotes.actionMarkAccepted")} primary />
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
            <button type="submit" className="btn-primary">
              <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
              {t("quotes.actionConvert")}
            </button>
          </form>
        )}
        {devis.facture && (
          <Link href={`/factures/${devis.facture.id}`} className="btn-secondary">
            <Receipt className="h-4 w-4" aria-hidden="true" />
            {t("quotes.viewInvoice", { number: devis.facture.numero })}
          </Link>
        )}
      </DocumentHeader>

      <FadeIn delay={0.05} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InfoTile icon={CalendarDays} label={t("documents.issueDate")} value={formatDate(devis.dateEmission, locale)} />
        <InfoTile
          icon={CalendarClock}
          label={t("quotes.validUntil")}
          value={devis.dateValidite ? formatDate(devis.dateValidite, locale) : "-"}
        />
        <InfoTile icon={CircleDollarSign} label={t("documents.totalTTC")} value={formatMontant(Number(devis.totalTTC), "TND", locale)} />
      </FadeIn>

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
                {devis.lignes.map((ligne) => (
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
              { label: t("documents.subtotalHT"), value: formatMontant(Number(devis.sousTotalHT), "TND", locale) },
              { label: t("documents.vat"), value: formatMontant(Number(devis.totalTva), "TND", locale) },
              { label: t("documents.totalTTC"), value: formatMontant(Number(devis.totalTTC), "TND", locale), variant: "total" as const },
            ]}
          />
        </FadeIn>
      </div>
    </div>
  );
}

function StatusButton({
  id,
  statut,
  label,
  primary = false,
}: {
  id: string;
  statut: "ENVOYE" | "ACCEPTE" | "REFUSE";
  label: string;
  primary?: boolean;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await updateDevisStatut(id, statut);
      }}
    >
      <button type="submit" className={primary ? "btn-primary" : "btn-secondary"}>
        {label}
      </button>
    </form>
  );
}
