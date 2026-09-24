import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMontant, formatDate } from "@/lib/format";
import { CalendarDays, CircleDollarSign, MessageSquareText, Undo2 } from "lucide-react";
import { DocumentHeader, InfoTile } from "@/components/layout/DocumentHeader";
import { TotalsCard } from "@/components/ui/TotalsCard";
import { FadeIn } from "@/components/motion/Motion";
import { getLocale, getT } from "@/i18n/server";
import { ToastOnParam } from "@/components/ui/ToastOnParam";
import { updateAvoirStatut } from "@/lib/actions/avoirs";

export default async function AvoirDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const avoir = await prisma.avoir.findUnique({
    where: { id },
    include: { client: true, lignes: true, factureOrigine: true },
  });

  if (!avoir) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <ToastOnParam />
      </Suspense>

      <DocumentHeader
        icon={Undo2}
        numero={avoir.numero}
        subtitle={
          <>
            {avoir.client.nom} · {t("creditNotes.onInvoice")}{" "}
            <Link href={`/factures/${avoir.factureOrigine.id}`} className="font-medium text-brand-600 hover:underline">
              {avoir.factureOrigine.numero}
            </Link>
          </>
        }
        statut={avoir.statut}
        pdfHref={`/avoirs/${avoir.id}/pdf`}
        pdfLabel={t("documents.viewPdf")}
      >
        {avoir.statut === "EMIS" && (
          <>
            <AvoirStatusButton id={avoir.id} statut="APPLIQUE" label={t("creditNotes.actionMarkApplied")} primary />
            <AvoirStatusButton id={avoir.id} statut="REMBOURSE" label={t("creditNotes.actionMarkRefunded")} />
            <AvoirStatusButton id={avoir.id} statut="ANNULE" label={t("creditNotes.actionCancel")} />
          </>
        )}
      </DocumentHeader>

      <FadeIn delay={0.05} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InfoTile icon={CalendarDays} label={t("documents.issueDate")} value={formatDate(avoir.dateEmission, locale)} />
        <InfoTile icon={CircleDollarSign} label={t("documents.totalTTC")} value={formatMontant(Number(avoir.totalTTC), "TND", locale)} />
      </FadeIn>

      {avoir.motif && (
        <FadeIn delay={0.08} className="card flex items-start gap-3 p-5 text-sm text-slate-600">
          <MessageSquareText className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-500" aria-hidden="true" />
          <p>
            <strong className="text-slate-900">{t("creditNotes.reasonLabel")} </strong>
            {avoir.motif}
          </p>
        </FadeIn>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:items-start">
        <FadeIn inView className="card overflow-hidden xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[560px]">
              <thead>
                <tr>
                  <th>{t("documents.designation")}</th>
                  <th className="text-end!">{t("documents.quantity")}</th>
                  <th className="text-end!">{t("documents.priceHT")}</th>
                  <th className="text-end!">{t("documents.vat")}</th>
                  <th className="text-end!">{t("documents.totalHT")}</th>
                </tr>
              </thead>
              <tbody>
                {avoir.lignes.map((ligne) => (
                  <tr key={ligne.id}>
                    <td className="font-medium text-slate-900">{ligne.designation}</td>
                    <td className="text-end tabular-nums">{Number(ligne.quantite)}</td>
                    <td className="text-end whitespace-nowrap tabular-nums">
                      {formatMontant(Number(ligne.prixUnitaireHT), "TND", locale)}
                    </td>
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
              { label: t("documents.subtotalHT"), value: formatMontant(Number(avoir.sousTotalHT), "TND", locale) },
              { label: t("documents.vat"), value: formatMontant(Number(avoir.totalTva), "TND", locale) },
              { label: t("documents.totalTTC"), value: formatMontant(Number(avoir.totalTTC), "TND", locale), variant: "total" as const },
            ]}
          />
        </FadeIn>
      </div>
    </div>
  );
}

function AvoirStatusButton({
  id,
  statut,
  label,
  primary = false,
}: {
  id: string;
  statut: "APPLIQUE" | "REMBOURSE" | "ANNULE";
  label: string;
  primary?: boolean;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await updateAvoirStatut(id, statut);
      }}
    >
      <button type="submit" className={primary ? "btn-primary" : "btn-secondary"}>
        {label}
      </button>
    </form>
  );
}
