import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMontant, formatDate } from "@/lib/format";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { getLocale, getT } from "@/i18n/server";
import { ToastOnParam } from "@/components/ui/ToastOnParam";
import { StatutBadge } from "@/components/StatutBadge";
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
      <Breadcrumbs lastLabel={avoir.numero} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{avoir.numero}</h1>
          <p className="text-sm text-neutral-500">
            {avoir.client.nom} — {t("creditNotes.onInvoice")}{" "}
            <Link href={`/factures/${avoir.factureOrigine.id}`} className="hover:underline">
              {avoir.factureOrigine.numero}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatutBadge statut={avoir.statut} />
          <a
            href={`/avoirs/${avoir.id}/pdf`}
            target="_blank"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            {t("documents.viewPdf")}
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {avoir.statut === "EMIS" && (
          <>
            <AvoirStatusButton id={avoir.id} statut="APPLIQUE" label={t("creditNotes.actionMarkApplied")} />
            <AvoirStatusButton id={avoir.id} statut="REMBOURSE" label={t("creditNotes.actionMarkRefunded")} />
            <AvoirStatusButton id={avoir.id} statut="ANNULE" label={t("creditNotes.actionCancel")} />
          </>
        )}
      </div>

      {avoir.motif && (
        <div className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
          <strong className="text-neutral-900">{t("creditNotes.reasonLabel")} </strong>
          {avoir.motif}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-start text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-normal">{t("documents.designation")}</th>
              <th className="px-4 py-2 font-normal">{t("documents.quantity")}</th>
              <th className="px-4 py-2 font-normal">{t("documents.priceHT")}</th>
              <th className="px-4 py-2 font-normal">{t("documents.vat")}</th>
              <th className="px-4 py-2 font-normal">{t("documents.totalHT")}</th>
            </tr>
          </thead>
          <tbody>
            {avoir.lignes.map((ligne) => (
              <tr key={ligne.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{ligne.designation}</td>
                <td className="px-4 py-2">{Number(ligne.quantite)}</td>
                <td className="px-4 py-2">{formatMontant(Number(ligne.prixUnitaireHT), "TND", locale)}</td>
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
          <span>{formatMontant(Number(avoir.sousTotalHT), "TND", locale)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">{t("documents.vat")}</span>
          <span>{formatMontant(Number(avoir.totalTva), "TND", locale)}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-200 pt-1 font-medium text-neutral-900">
          <span>{t("documents.totalTTC")}</span>
          <span>{formatMontant(Number(avoir.totalTTC), "TND", locale)}</span>
        </div>
      </div>

      <p className="text-xs text-neutral-400">
        {t("creditNotes.issuedOn", { date: formatDate(avoir.dateEmission, locale) })}
      </p>
    </div>
  );
}

function AvoirStatusButton({
  id,
  statut,
  label,
}: {
  id: string;
  statut: "APPLIQUE" | "REMBOURSE" | "ANNULE";
  label: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await updateAvoirStatut(id, statut);
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
