import { db } from "@/db";
import { TAX_KINDS } from "@/db/schema";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { formatPercent } from "@/lib/money";
import { listTaxRates } from "@/lib/taxes";
import { Field, Flash, StatusBadge } from "@/components/ui";
import { createTaxRateAction, toggleTaxRateAction } from "../actions";

export const dynamic = "force-dynamic";

const KIND_LABELS = { tva: "TVA", fodec: "FODEC", retenue: "Retenue à la source" } as const;

export default async function TaxesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const canWrite = can(user.role, "settings:manage");
  const rates = await listTaxRates(db);
  const { ok, error } = await searchParams;

  return (
    <div className="space-y-4">
      <Flash ok={ok} error={error} />
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Un taux existant ne peut pas être modifié : pour changer un taux, désactivez l&apos;ancien et créez-en un nouveau.
        Les taux de retenue à la source ne sont pas pré-remplis : leur base et leur taux sont à valider avec votre expert-comptable.
      </p>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Code</th><th className="p-3">Libellé</th><th className="p-3">Type</th>
              <th className="p-3 text-right">Taux</th><th className="p-3">État</th>{canWrite && <th className="p-3" />}
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 font-mono">{r.code}</td>
                <td className="p-3">{r.label}</td>
                <td className="p-3">{KIND_LABELS[r.kind]}</td>
                <td className="p-3 text-right">{formatPercent(r.rate)}</td>
                <td className="p-3"><StatusBadge active={r.isActive} /></td>
                {canWrite && (
                  <td className="p-3">
                    <form action={toggleTaxRateAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="isActive" value={String(!r.isActive)} />
                      <button className="btn btn-ghost">{r.isActive ? "Désactiver" : "Réactiver"}</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <form action={createTaxRateAction} className="card p-4 grid gap-3 sm:grid-cols-4 items-end">
          <Field label="Code"><input className="input" name="code" required placeholder="RAS15" maxLength={20} /></Field>
          <Field label="Libellé"><input className="input" name="label" required maxLength={100} /></Field>
          <Field label="Type">
            <select className="input" name="kind" defaultValue="retenue">
              {TAX_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </Field>
          <Field label="Taux (%)"><input className="input" name="rate" required inputMode="decimal" placeholder="1,5" /></Field>
          <div className="sm:col-span-4"><button className="btn">Ajouter le taux</button></div>
        </form>
      )}
    </div>
  );
}
