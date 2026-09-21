import Link from "next/link";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { overdueInvoices } from "@/lib/invoicing/reminders";
import { formatTnd } from "@/lib/money";
import { Flash, PageHeader } from "@/components/ui";
import { runRemindersAction, sendReminderAction } from "./actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeZone: "UTC" });

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission("payments:read");
  const { ok, error } = await searchParams;
  const canSend = can(user.role, "payments:write");
  const rows = await overdueInvoices(db);
  const dueNow = rows.filter((r) => r.candidateLevel !== null);

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Relances des impayés" />
      <Flash ok={ok} error={error} />

      <div className="card p-4 flex flex-wrap gap-3 items-center justify-between">
        <p className="text-sm">
          <strong>{rows.length}</strong> facture(s) échue(s) avec un solde dû · <strong>{dueNow.length}</strong> relance(s) à envoyer maintenant.
          <span className="block text-xs mt-1" style={{ color: "var(--muted)" }}>
            Les modèles et délais se règlent dans{" "}
            <Link className="underline" href="/parametres/relances">Paramètres › Relances</Link>.
            Pour un envoi quotidien automatique : <code>npm run reminders</code> (planificateur système) ou l&apos;URL protégée <code>/api/cron/reminders</code>.
          </span>
        </p>
        {canSend && dueNow.length > 0 && (
          <form action={runRemindersAction}>
            <button className="btn">Envoyer les {dueNow.length} relance(s) dues</button>
          </form>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Facture</th><th className="p-3">Client</th><th className="p-3">Échéance</th>
              <th className="p-3 text-right">Retard</th><th className="p-3 text-right">Reste dû</th>
              <th className="p-3">Dernière relance</th><th className="p-3">Prochaine</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.invoiceId} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 font-mono"><Link className="underline" href={`/factures/${r.invoiceId}`}>{r.number}</Link></td>
                <td className="p-3">{r.customerName}</td>
                <td className="p-3 whitespace-nowrap">{dateFmt.format(new Date(`${r.dueDate}T00:00:00Z`))}</td>
                <td className="p-3 text-right whitespace-nowrap">{r.daysLate} j</td>
                <td className="p-3 text-right whitespace-nowrap">{formatTnd(r.due)}</td>
                <td className="p-3">{r.lastLevel ? `Niveau ${r.lastLevel}` : "—"}</td>
                <td className="p-3">{r.candidateLevel ? `Niveau ${r.candidateLevel}` : "—"}</td>
                <td className="p-3">
                  {canSend && r.candidateLevel !== null && (
                    <form action={sendReminderAction}>
                      <input type="hidden" name="id" value={r.invoiceId} />
                      <button className="btn btn-ghost">Relancer</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="p-3" colSpan={8} style={{ color: "var(--muted)" }}>Aucune facture échue.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
