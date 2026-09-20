import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { formatDocumentNumber, listSeriesConfigs } from "@/lib/numbering";
import { Flash } from "@/components/ui";
import { updateSeriesAction } from "../actions";

export const dynamic = "force-dynamic";

const LABELS = {
  invoice: "Factures",
  credit_note: "Avoirs",
  quote: "Devis",
  deposit_invoice: "Factures d'acompte",
  delivery_note: "Bons de livraison",
  customer: "Codes clients",
  product: "Codes articles",
} as const;

export default async function NumberingPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const canWrite = can(user.role, "settings:manage");
  const configs = await listSeriesConfigs(db);
  const { ok, error } = await searchParams;
  const year = new Date().getFullYear();

  return (
    <div className="space-y-4">
      <Flash ok={ok} error={error} />
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Les numéros de documents fiscaux sont attribués à la validation, sans trou. Dès qu&apos;un numéro a été attribué
        dans une série, son préfixe et sa remise à zéro annuelle sont verrouillés.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Document</th><th className="p-3">Préfixe</th><th className="p-3">Chiffres</th>
              <th className="p-3">Remise à zéro annuelle</th><th className="p-3">Exemple</th>{canWrite && <th className="p-3" />}
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.docType} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">{LABELS[c.docType]}</td>
                <td colSpan={canWrite ? 3 : 1} className="p-0">
                  {canWrite ? (
                    <form action={updateSeriesAction} className="flex items-center gap-3 p-3">
                      <input type="hidden" name="docType" value={c.docType} />
                      <input className="input !w-24" name="prefix" defaultValue={c.prefix} maxLength={10} required />
                      <input className="input !w-20" name="padLength" type="number" min={1} max={12} defaultValue={c.padLength} required />
                      <label className="flex items-center gap-2"><input type="checkbox" name="resetYearly" defaultChecked={c.resetYearly} /> Oui</label>
                      <button className="btn btn-ghost ml-auto">Enregistrer</button>
                    </form>
                  ) : (
                    <span className="p-3 inline-block">{c.prefix} · {c.padLength} · {c.resetYearly ? "oui" : "non"}</span>
                  )}
                </td>
                {!canWrite && <><td className="p-3">{c.padLength}</td><td className="p-3">{c.resetYearly ? "Oui" : "Non"}</td></>}
                <td className="p-3 font-mono whitespace-nowrap">{formatDocumentNumber(c, year, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
