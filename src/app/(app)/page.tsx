import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { computeFactureDisplayStatut } from "@/lib/factureStatus";
import { FadeIn } from "@/components/motion/Motion";
import { getLocale, getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import { RevenueChart, StatusDistributionChart } from "./DashboardCharts";
import { QuickActions, StatCards } from "./DashboardStats";
import { DashboardInvoiceGrid, type DashboardFactureRow } from "./DashboardInvoiceGrids";
import { PriorityCollections, type PriorityRow } from "./PriorityCollections";
import { showsRisk } from "@/lib/ml";

export default async function DashboardPage() {
  const now = new Date();
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);

  const [t, locale, factures, devisEnAttente, nombreClients, mlRun] = await Promise.all([
    getT(),
    getLocale(),
    prisma.facture.findMany({
      include: {
        client: true,
        mlScore: { select: { riskLevel: true, lateProbability: true, expectedPaymentDate: true, isAnomaly: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.devis.count({ where: { statut: { in: ["BROUILLON", "ENVOYE"] } } }),
    prisma.client.count({ where: { actif: true } }),
    prisma.mlModelRun.findFirst({ orderBy: { trainedAt: "desc" }, select: { modelVersion: true } }),
  ]);

  const enriched = factures.map((f) => {
    const totalTTC = Number(f.totalTTC);
    const montantPaye = Number(f.montantPaye);
    return {
      ...f,
      totalTTC,
      montantPaye,
      resteAPayer: totalTTC - montantPaye,
      displayStatut: computeFactureDisplayStatut({
        statut: f.statut,
        dateEcheance: f.dateEcheance,
        totalTTC,
        montantPaye,
      }),
    };
  });

  const caDuMois = enriched
    .filter((f) => f.dateEmission >= debutMois && f.statut !== "ANNULEE")
    .reduce((sum, f) => sum + f.totalTTC, 0);

  const montantAEncaisser = enriched
    .filter((f) => f.statut !== "ANNULEE")
    .reduce((sum, f) => sum + Math.max(0, f.resteAPayer), 0);

  const facturesEnRetard = enriched.filter((f) => f.displayStatut === "EN_RETARD");
  const facturesPayees = enriched.filter((f) => f.statut === "PAYEE");

  const recentFactures: DashboardFactureRow[] = enriched.slice(0, 5).map((f) => ({
    id: f.id,
    numero: f.numero,
    clientNom: f.client.nom,
    dateEcheance: f.dateEcheance?.toISOString() ?? null,
    resteAPayer: f.resteAPayer,
    statut: f.displayStatut,
  }));

  const overdueFactures: DashboardFactureRow[] = facturesEnRetard
    .sort((a, b) => (a.dateEcheance?.getTime() ?? 0) - (b.dateEcheance?.getTime() ?? 0))
    .slice(0, 8)
    .map((f) => ({
      id: f.id,
      numero: f.numero,
      clientNom: f.client.nom,
      dateEcheance: f.dateEcheance?.toISOString() ?? null,
      resteAPayer: f.resteAPayer,
      statut: f.displayStatut,
    }));

  const revenueByMonth: { label: string; total: number }[] = Array.from({ length: 6 }, (_, i) => {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 1);
    const total = enriched
      .filter((f) => f.statut !== "ANNULEE" && f.dateEmission >= monthDate && f.dateEmission < nextMonth)
      .reduce((sum, f) => sum + f.totalTTC, 0);
    return { label: monthDate.toLocaleDateString(INTL_LOCALE[locale], { month: "short" }), total };
  });

  // ---- ML insights (only when a model run has been imported into this database)
  const scoredOpen = enriched.filter((f) => f.mlScore?.riskLevel && showsRisk(f.statut, f.resteAPayer));
  const highRisk = scoredOpen
    .filter((f) => f.mlScore!.riskLevel === "HIGH")
    .map((f) => ({ ...f, probability: Number(f.mlScore!.lateProbability ?? 0) }))
    .sort((a, b) => b.probability * b.resteAPayer - a.probability * a.resteAPayer);
  const priorityRows: PriorityRow[] = highRisk.slice(0, 5).map((f) => ({
    id: f.id,
    numero: f.numero,
    clientNom: f.client.nom,
    clientEmail: f.client.email,
    resteAPayer: f.resteAPayer,
    lateProbability: f.probability,
    dateEcheance: f.dateEcheance?.toISOString() ?? null,
  }));
  const amountAtRisk = highRisk.reduce((sum, f) => sum + f.resteAPayer, 0);
  const unusualCount = enriched.filter((f) => f.mlScore?.isAnomaly && f.statut !== "ANNULEE").length;

  // Expected collections per week (weeks start on Monday), at the model's expected payment date.
  // Calendar arithmetic (not fixed 7-day milliseconds) so weeks stay aligned across DST changes.
  const mondayOffset = (now.getDay() + 6) % 7;
  const weekStarts = Array.from(
    { length: 9 },
    (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset + 7 * i),
  );
  const forecast = weekStarts.slice(0, 8).map((start) => ({
    label: start.toLocaleDateString(INTL_LOCALE[locale], { day: "2-digit", month: "2-digit" }),
    total: 0,
  }));
  for (const f of scoredOpen) {
    const expected = f.mlScore!.expectedPaymentDate;
    if (!expected) continue;
    const week = weekStarts.findIndex((start, i) => i < 8 && expected >= start && expected < weekStarts[i + 1]);
    if (week >= 0) forecast[week].total += f.resteAPayer;
  }

  const statusCounts = ["BROUILLON", "ENVOYEE", "PARTIELLEMENT_PAYEE", "PAYEE", "EN_RETARD", "ANNULEE"].map(
    (statut) => ({
      statut,
      label: t(`status.${statut}`),
      count: enriched.filter((f) => f.displayStatut === statut).length,
    }),
  );

  return (
    <div className="space-y-6 lg:space-y-8">
      <FadeIn className="bg-brand-gradient relative overflow-hidden rounded-3xl px-6 py-7 text-white shadow-xl shadow-brand-600/20 sm:px-8 sm:py-9">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -end-16 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute -bottom-28 start-1/3 h-64 w-64 rounded-full bg-fuchsia-400/25 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.06)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
        </div>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25 backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {now.toLocaleDateString(INTL_LOCALE[locale], { weekday: "long", day: "numeric", month: "long" })}
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{t("dashboard.title")}</h1>
            <p className="mt-2 text-sm text-white/80 sm:text-base">{t("dashboard.description")}</p>
          </div>
          <div>
            <h2 className="sr-only">{t("dashboard.quickActions")}</h2>
            <QuickActions
              actions={[
                { href: "/factures/new", label: t("invoices.newInvoice") },
                { href: "/devis/new", label: t("quotes.newQuote") },
                { href: "/clients/new", label: t("clients.newClient") },
                { href: "/produits/new", label: t("dashboard.addProduct") },
              ]}
            />
          </div>
        </div>
      </FadeIn>

      <StatCards
        stats={[
          { icon: "revenue", label: t("dashboard.revenueThisMonth"), value: caDuMois, format: "currency", accent: "indigo", href: "/factures" },
          { icon: "wallet", label: t("dashboard.toCollect"), value: montantAEncaisser, format: "currency", accent: "amber", href: "/factures" },
          { icon: "alert", label: t("dashboard.overdueInvoices"), value: facturesEnRetard.length, format: "number", accent: "rose", href: "/factures" },
          { icon: "check", label: t("dashboard.paidInvoices"), value: facturesPayees.length, format: "number", accent: "emerald", href: "/factures" },
          { icon: "quote", label: t("dashboard.pendingQuotes"), value: devisEnAttente, format: "number", accent: "sky", href: "/devis" },
          { icon: "users", label: t("dashboard.clients"), value: nombreClients, format: "number", accent: "violet", href: "/clients" },
        ]}
      />

      {mlRun && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <FadeIn inView className="xl:col-span-2">
            <PriorityCollections
              top={priorityRows}
              reminderTargets={highRisk.map((f) => ({ id: f.id, numero: f.numero, clientEmail: f.client.email }))}
              amountAtRisk={amountAtRisk}
              highRiskCount={highRisk.length}
              unusualCount={unusualCount}
            />
          </FadeIn>
          <FadeIn inView delay={0.08} className="card p-5 sm:p-6">
            <h2 className="section-title">{t("ml.forecastTitle")}</h2>
            <p className="mt-1 mb-5 text-xs text-slate-500">{t("ml.forecastHint")}</p>
            <RevenueChart data={forecast} title={t("ml.forecastTitle")} locale={locale} tone="emerald" />
          </FadeIn>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <FadeIn inView className="card p-5 sm:p-6 xl:col-span-2">
          <h2 className="section-title mb-5">{t("dashboard.revenueChartTitle")}</h2>
          <RevenueChart data={revenueByMonth} title={t("dashboard.revenueChartTitle")} locale={locale} />
        </FadeIn>
        <FadeIn inView delay={0.08} className="card p-5 sm:p-6">
          <h2 className="section-title mb-5">{t("dashboard.invoiceBreakdown")}</h2>
          <StatusDistributionChart data={statusCounts} />
        </FadeIn>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <FadeIn inView className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <h2 className="section-title">{t("dashboard.recentInvoices")}</h2>
          </div>
          <DashboardInvoiceGrid rows={recentFactures} emptyMessage={t("dashboard.noInvoices")} />
        </FadeIn>
        <FadeIn inView delay={0.08} className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 sm:px-6">
            <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_4px_rgb(244_63_94/0.15)]" />
            <h2 className="section-title">{t("dashboard.overdueInvoices")}</h2>
          </div>
          <DashboardInvoiceGrid rows={overdueFactures} emptyMessage={t("dashboard.noOverdueInvoices")} />
        </FadeIn>
      </div>
    </div>
  );
}
