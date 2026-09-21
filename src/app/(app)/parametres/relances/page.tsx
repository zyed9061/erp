import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { listReminderRules } from "@/lib/invoicing/reminders";
import { Field, Flash } from "@/components/ui";
import { updateReminderRuleAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ReminderSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const canWrite = can(user.role, "settings:manage");
  const rules = await listReminderRules(db);
  const { ok, error } = await searchParams;

  return (
    <div className="space-y-4">
      <Flash ok={ok} error={error} />
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Un niveau est envoyé une seule fois par facture, N jours après l&apos;échéance, tant qu&apos;un solde reste dû. Les délais
        doivent augmenter d&apos;un niveau à l&apos;autre. Variables disponibles :{" "}
        <code>{"{{numero}} {{client}} {{echeance}} {{reste_du}} {{jours_retard}} {{societe}}"}</code>.
      </p>
      {rules.map((r) => (
        <form key={r.level} action={updateReminderRuleAction} className="card p-4">
          <fieldset disabled={!canWrite} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="level" value={r.level} />
            <h2 className="font-medium sm:col-span-4">Niveau {r.level}</h2>
            <Field label="Délai après l'échéance (jours)">
              <input className="input" name="daysAfterDue" type="number" min={1} max={365} defaultValue={r.daysAfterDue} required />
            </Field>
            <label className="flex items-center gap-2 text-sm self-end pb-2">
              <input type="checkbox" name="isActive" defaultChecked={r.isActive} /> Actif
            </label>
            <Field label="Objet" className="sm:col-span-4">
              <input className="input" name="subject" defaultValue={r.subject} required maxLength={200} />
            </Field>
            <Field label="Message" className="sm:col-span-4">
              <textarea className="input" name="body" rows={7} defaultValue={r.body} required maxLength={4000} />
            </Field>
            {canWrite && <div className="sm:col-span-4"><button className="btn">Enregistrer le niveau {r.level}</button></div>}
          </fieldset>
        </form>
      ))}
    </div>
  );
}
