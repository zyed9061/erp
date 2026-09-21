import Link from "next/link";
import { db } from "@/db";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { todayTunis } from "@/lib/dates";
import { listRecurringTemplates } from "@/lib/invoicing/recurring";
import { formatTnd } from "@/lib/money";
import { dashboardStats } from "@/lib/reports";
import { RevenueChart } from "./revenue-chart";

export const dynamic = "force-dynamic";

function Kpi({ label, value, href, alert }: { label: string; value: string; href?: string; alert?: boolean }) {
  const body = (
    <>
      <p className="text-sm" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="text-xl font-semibold tabular-nums" style={alert ? { color: "var(--danger)" } : undefined}>{value}</p>
    </>
  );
  return href ? <Link href={href} className="card p-4 block hover:opacity-90">{body}</Link> : <div className="card p-4">{body}</div>;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const header = (
    <div>
      <h1 className="text-2xl font-semibold">Bonjour, {user.name}</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>Connecté en tant que {ROLE_LABELS[user.role]}.</p>
    </div>
  );

  if (!can(user.role, "reports:read")) {
    return <div className="space-y-4 max-w-3xl">{header}</div>;
  }

  const today = todayTunis();
  const [s, templates] = await Promise.all([dashboardStats(db, today), listRecurringTemplates(db, { status: "active" })]);
  const recurringDue = templates.filter((t) => t.template.nextRunDate <= today).length;

  return (
    <div className="space-y-6 max-w-6xl">
      {header}

      <section aria-label="Indicateurs" className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="CA HT du mois" value={formatTnd(s.revenueMonthHt)} href="/rapports?tab=ca" />
        <Kpi label="CA HT de l'année" value={formatTnd(s.revenueYearHt)} href="/rapports?tab=ca" />
        <Kpi label="Encaissé ce mois" value={formatTnd(s.collectedMonth)} href="/rapports?tab=encaissements" />
        <Kpi label="Créances ouvertes" value={formatTnd(s.receivablesTotal)} href="/rapports?tab=balance" />
        <Kpi
          label={`En retard (${s.overdueCount} facture${s.overdueCount > 1 ? "s" : ""})`} value={formatTnd(s.overdueTotal)}
          href="/relances" alert={s.overdueCount > 0}
        />
        <Kpi label="Factures brouillon" value={String(s.draftInvoices)} href="/factures?status=draft" />
        <Kpi label="Devis en attente de réponse" value={String(s.quotesAwaiting)} href="/devis?status=sent" />
        <Kpi label="Bons de livraison à facturer" value={String(s.deliveriesToInvoice)} href="/livraisons" />
        <Kpi label="Produits en stock bas" value={String(s.lowStock)} href="/stock" alert={s.lowStock > 0} />
        <Kpi label="Chantiers actifs" value={String(s.activeProjects)} href="/chantiers" />
        <Kpi label="Récurrentes à générer" value={String(recurringDue)} href="/recurrentes" alert={recurringDue > 0} />
      </section>

      <section className="card p-4">
        <h2 className="font-medium mb-2">Chiffre d&apos;affaires — 12 derniers mois</h2>
        <RevenueChart data={s.series} />
      </section>
    </div>
  );
}
