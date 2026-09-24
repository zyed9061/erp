import Link from "next/link";
import {
  TrendingUp,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Users,
  Plus,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatMontant } from "@/lib/format";
import { computeFactureDisplayStatut } from "@/lib/factureStatus";
import { PageHeader } from "@/components/layout/PageHeader";
import { getLocale, getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import { RevenueChart, StatusDistributionChart } from "./DashboardCharts";
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
    <div className="space-y-6">
      <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={TrendingUp}
          label={t("dashboard.revenueThisMonth")}
          value={formatMontant(caDuMois, "TND", locale)}
          accent="teal"
        />
        <StatCard
          icon={Wallet}
          label={t("dashboard.toCollect")}
          value={formatMontant(montantAEncaisser, "TND", locale)}
          accent="amber"
        />
        <StatCard
          icon={AlertTriangle}
          label={t("dashboard.overdueInvoices")}
          value={String(facturesEnRetard.length)}
          accent="red"
        />
        <StatCard
          icon={CheckCircle2}
          label={t("dashboard.paidInvoices")}
          value={String(facturesPayees.length)}
          accent="green"
        />
        <StatCard
          icon={FileText}
          label={t("dashboard.pendingQuotes")}
          value={String(devisEnAttente)}
          accent="blue"
        />
        <StatCard icon={Users} label={t("dashboard.clients")} value={String(nombreClients)} accent="teal" />
      </div>

      {mlRun && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PriorityCollections
              top={priorityRows}
              reminderTargets={highRisk.map((f) => ({ id: f.id, numero: f.numero, clientEmail: f.client.email }))}
              amountAtRisk={amountAtRisk}
              highRiskCount={highRisk.length}
              unusualCount={unusualCount}
            />
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white shadow-xs p-5">
            <h2 className="text-sm font-semibold text-neutral-900">{t("ml.forecastTitle")}</h2>
            <p className="mb-4 text-xs text-neutral-500">{t("ml.forecastHint")}</p>
            <RevenueChart data={forecast} title={t("ml.forecastTitle")} locale={locale} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white shadow-xs p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">
            {t("dashboard.revenueChartTitle")}
          </h2>
          <RevenueChart data={revenueByMonth} title={t("dashboard.revenueChartTitle")} locale={locale} />
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white shadow-xs p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">{t("dashboard.invoiceBreakdown")}</h2>
          <StatusDistributionChart data={statusCounts} />
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white shadow-xs p-5">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">{t("dashboard.quickActions")}</h2>
        <div className="flex flex-wrap gap-2">
          <QuickAction href="/factures/new" label={t("invoices.newInvoice")} />
          <QuickAction href="/devis/new" label={t("quotes.newQuote")} />
          <QuickAction href="/clients/new" label={t("clients.newClient")} />
          <QuickAction href="/produits/new" label={t("dashboard.addProduct")} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
          <div className="border-b border-neutral-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">{t("dashboard.recentInvoices")}</h2>
          </div>
          <DashboardInvoiceGrid rows={recentFactures} emptyMessage={t("dashboard.noInvoices")} />
        </div>
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
          <div className="border-b border-neutral-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">{t("dashboard.overdueInvoices")}</h2>
          </div>
          <DashboardInvoiceGrid rows={overdueFactures} emptyMessage={t("dashboard.noOverdueInvoices")} />
        </div>
      </div>
    </div>
  );
}

const ACCENTS = {
  teal: "bg-brand-50 text-brand-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  green: "bg-green-50 text-green-700",
  blue: "bg-blue-50 text-blue-700",
};

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${ACCENTS[accent]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      </div>
      <p className="mt-2 text-xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
    >
      <Plus className="h-4 w-4" aria-hidden="true" /> {label}
    </Link>
  );
}
