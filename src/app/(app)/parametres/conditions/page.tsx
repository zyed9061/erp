import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { listPaymentTerms } from "@/lib/payment-terms";
import { Field, Flash, StatusBadge } from "@/components/ui";
import { createPaymentTermAction, updatePaymentTermAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PaymentTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const canWrite = can(user.role, "settings:manage");
  const terms = await listPaymentTerms(db);
  const { ok, error } = await searchParams;

  return (
    <div className="space-y-4">
      <Flash ok={ok} error={error} />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Libellé</th><th className="p-3">Délai</th><th className="p-3">État</th>{canWrite && <th className="p-3" />}
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">{t.label}{t.isDefault && <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>par défaut</span>}</td>
                <td className="p-3">{t.days} j{t.endOfMonth ? " fin de mois" : ""}</td>
                <td className="p-3"><StatusBadge active={t.isActive} /></td>
                {canWrite && (
                  <td className="p-3 flex gap-2 flex-wrap">
                    {!t.isDefault && t.isActive && (
                      <form action={updatePaymentTermAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="intent" value="default" />
                        <button className="btn btn-ghost">Par défaut</button>
                      </form>
                    )}
                    <form action={updatePaymentTermAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="isActive" value={String(!t.isActive)} />
                      <button className="btn btn-ghost">{t.isActive ? "Désactiver" : "Réactiver"}</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <form action={createPaymentTermAction} className="card p-4 grid gap-3 sm:grid-cols-3 items-end">
          <Field label="Libellé"><input className="input" name="label" required maxLength={100} placeholder="45 jours" /></Field>
          <Field label="Délai (jours)"><input className="input" name="days" type="number" min={0} max={365} defaultValue={30} required /></Field>
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" name="endOfMonth" /> Fin de mois</label>
          <div className="sm:col-span-3"><button className="btn">Ajouter la condition</button></div>
        </form>
      )}
    </div>
  );
}
