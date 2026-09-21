import Link from "next/link";
import { RECURRING_STATUSES } from "@/db/schema";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { todayTunis } from "@/lib/dates";
import { FREQUENCY_LABELS, listRecurringTemplates } from "@/lib/invoicing/recurring";
import { Flash, PageHeader } from "@/components/ui";
import { runRecurringAction } from "./actions";
import { RECURRING_STATUS_LABELS } from "./labels";

export const dynamic = "force-dynamic";

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ok?: string; error?: string }>;
}) {
  const user = await requirePermission("recurring:read");
  const sp = await searchParams;
  const status = RECURRING_STATUSES.find((s) => s === sp.status);
  const rows = await listRecurringTemplates(db, { status });
  const canWrite = can(user.role, "recurring:write");
  const today = todayTunis();
  const dueNow = rows.filter((r) => r.template.status === "active" && r.template.nextRunDate <= today).length;

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Factures récurrentes"
        action={canWrite ? { href: "/recurrentes/nouveau", label: "Nouveau modèle" } : undefined}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="card p-4 flex flex-wrap gap-3 items-center justify-between">
        <p className="text-sm">
          <strong>{dueNow}</strong> modèle(s) avec une échéance due.
          <span className="block text-xs mt-1" style={{ color: "var(--muted)" }}>
            Génération automatique quotidienne : <code>npm run recurring</code> (planificateur système) ou l&apos;URL protégée{" "}
            <code>/api/cron/recurring</code>. Une période n&apos;est jamais générée deux fois.
          </span>
        </p>
        {canWrite && dueNow > 0 && (
          <form action={runRecurringAction}><button className="btn">Générer les échéances dues</button></form>
        )}
      </div>

      <form className="flex gap-2 items-center">
        <select className="input !w-auto" name="status" defaultValue={status ?? ""}>
          <option value="">Tous les statuts</option>
          {RECURRING_STATUSES.map((s) => <option key={s} value={s}>{RECURRING_STATUS_LABELS[s]}</option>)}
        </select>
        <button className="btn btn-ghost">Filtrer</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Modèle</th><th className="p-3">Client</th><th className="p-3">Fréquence</th>
              <th className="p-3">Prochaine échéance</th><th className="p-3">Mode</th><th className="p-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ template: t, customerName }) => (
              <tr key={t.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3"><Link className="underline" href={`/recurrentes/${t.id}`}>{t.name}</Link></td>
                <td className="p-3">{customerName}</td>
                <td className="p-3">{FREQUENCY_LABELS[t.frequency]}</td>
                <td className="p-3 whitespace-nowrap" style={t.status === "active" && t.nextRunDate <= today ? { color: "var(--danger)" } : undefined}>
                  {t.status === "ended" ? "—" : t.nextRunDate}
                </td>
                <td className="p-3">{t.autoValidate ? (t.autoSend ? "Validée + e-mail" : "Validée") : "Brouillon"}</td>
                <td className="p-3">{RECURRING_STATUS_LABELS[t.status]}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="p-3" colSpan={6} style={{ color: "var(--muted)" }}>Aucun modèle.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
