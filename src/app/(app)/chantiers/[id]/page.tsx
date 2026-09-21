import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { todayTunis } from "@/lib/dates";
import { formatAmount, formatPercent, formatTnd } from "@/lib/money";
import { getProject } from "@/lib/projects";
import { Field, Flash } from "@/components/ui";
import {
  createSituationAction, releaseHoldbackAction, saveProjectAction, setProjectStatusAction, updateProjectMetaAction,
} from "../actions";
import { loadProjectEditorData } from "../editor-data";
import { PROJECT_LABELS } from "../labels";
import { ProjectEditor } from "../project-editor";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission("projects:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const d = await getProject(db, id);
  if (!d) notFound();
  const { project: p, customer, progress, situations, releases, holdback } = d;
  const { ok, error } = await searchParams;
  const canWrite = can(user.role, "projects:write");
  const last = situations.at(-1);
  const lastPending = last && last.invoice.status !== "validated" ? last : null;
  const nextNumber = (last?.situation.number ?? 0) + 1;
  // Bordereau modifiable tant qu'aucune situation n'existe.
  const editorData = d.canEditLines && canWrite ? await loadProjectEditorData({ includeCustomerId: p.customerId }) : null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">{p.name}</h1>
        <span className="text-xs rounded-full px-2 py-0.5 border" style={{ borderColor: "var(--border)" }}>{PROJECT_LABELS[p.status]}</span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>{customer?.name}</span>
      </div>
      <Flash ok={ok} error={error} />

      <section className="card p-4 grid gap-2 sm:grid-cols-4 text-sm">
        <p>Marché HT<br /><strong className="text-lg">{formatTnd(d.contract.ht)}</strong></p>
        <p>Marché TTC<br /><strong className="text-lg">{formatTnd(d.contract.ttc)}</strong></p>
        <p>Avancement facturé<br /><strong className="text-lg">{formatPercent(d.overallPercent)}</strong> <span style={{ color: "var(--muted)" }}>({formatTnd(d.doneHt)} HT)</span></p>
        <p>Retenue de garantie<br /><strong className="text-lg">{formatPercent(p.holdbackPercent)}</strong></p>
      </section>

      {/* Bordereau : modifiable tant qu'aucune situation n'existe */}
      {editorData ? (
        <ProjectEditor
          action={saveProjectAction} id={p.id} customers={editorData.customers} tvaRates={editorData.tvaRates} submitLabel="Enregistrer le chantier"
          initial={{
            name: p.name, description: p.description ?? "", customerId: p.customerId, holdbackPercent: p.holdbackPercent,
            lines: d.lines.map((l) => ({
              description: l.description, unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice,
              tvaRateId: editorData.allTvaRates.find((t) => t.code === l.tvaCode)?.id ?? editorData.tvaRates[0]?.id ?? "",
            })),
          }}
        />
      ) : (
        <section className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left" style={{ color: "var(--muted)" }}>
                <th className="p-3">Poste</th><th className="p-3 text-right">Quantité</th><th className="p-3 text-right">Prix unitaire</th>
                <th className="p-3 text-right">TVA</th><th className="p-3 text-right">Avancement cumulé</th>
              </tr>
            </thead>
            <tbody>
              {progress.map(({ line: l, percent, quantity }) => (
                <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">{l.description}</td>
                  <td className="p-3 text-right whitespace-nowrap">{formatAmount(l.quantity)} {l.unit}</td>
                  <td className="p-3 text-right whitespace-nowrap">{formatAmount(l.unitPrice)}</td>
                  <td className="p-3 text-right">{formatPercent(l.tvaRate)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{formatPercent(percent)} <span style={{ color: "var(--muted)" }}>({formatAmount(quantity)} {l.unit})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Nouvelle situation */}
      {p.status === "active" && canWrite && (
        <section className="card p-4 space-y-3">
          <h2 className="font-medium">Situation n° {nextNumber}</h2>
          {lastPending ? (
            <p className="text-sm">
              La situation n° {lastPending.situation.number} est encore en brouillon :{" "}
              <Link className="underline" href={`/factures/${lastPending.invoice.id}`}>validez ou supprimez sa facture</Link> avant d&apos;en créer une nouvelle.
            </p>
          ) : (
            <form action={createSituationAction} className="space-y-3">
              <input type="hidden" name="id" value={p.id} />
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Saisissez l&apos;avancement <strong>cumulé</strong> de chaque poste (de 0 à 100 %). Seule la part ajoutée depuis la dernière situation est facturée.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {progress.map(({ line: l, percent }) => (
                      <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="p-2">{l.description}</td>
                        <td className="p-2 text-right whitespace-nowrap" style={{ color: "var(--muted)" }}>actuel : {formatPercent(percent)}</td>
                        <td className="p-2 w-36"><input className="input" name={`pct_${l.id}`} inputMode="decimal" placeholder="% cumulé" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3 items-end flex-wrap">
                <Field label="Date d'émission"><input className="input" type="date" name="issueDate" defaultValue={todayTunis()} /></Field>
                <button className="btn">Créer la situation et son brouillon de facture</button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="card overflow-x-auto">
        <h2 className="font-medium p-4 pb-0">Situations facturées</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">N°</th><th className="p-3">Facture</th><th className="p-3">Date</th>
              <th className="p-3 text-right">HT</th><th className="p-3 text-right">Retenue de garantie</th><th className="p-3 text-right">Net à payer</th><th className="p-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {situations.map(({ situation: s, invoice: i }) => (
              <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">{s.number}</td>
                <td className="p-3 font-mono"><Link className="underline" href={`/factures/${i.id}`}>{i.number ?? "Brouillon"}</Link></td>
                <td className="p-3 whitespace-nowrap">{s.issueDate}</td>
                <td className="p-3 text-right whitespace-nowrap">{formatTnd(i.totalHt)}</td>
                <td className="p-3 text-right whitespace-nowrap">{Number(i.guaranteeHoldback) > 0 ? formatTnd(i.guaranteeHoldback) : "—"}</td>
                <td className="p-3 text-right whitespace-nowrap">{formatTnd(i.netToPay)}</td>
                <td className="p-3">{i.status === "validated" ? "Validée" : "Brouillon"}</td>
              </tr>
            ))}
            {situations.length === 0 && <tr><td className="p-3" colSpan={7} style={{ color: "var(--muted)" }}>Aucune situation.</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Retenue de garantie */}
      {(Number(holdback.held) > 0 || Number(p.holdbackPercent) > 0) && (
        <section className="card p-4 space-y-3">
          <h2 className="font-medium">Retenue de garantie</h2>
          <p className="text-sm">
            Retenue : <strong>{formatTnd(holdback.held)}</strong> · libérée : {formatTnd(holdback.released)} · restante : <strong>{formatTnd(holdback.remaining)}</strong>
          </p>
          <ul className="text-sm space-y-1">
            {releases.map((r) => <li key={r.id}>{r.releasedOn} · {formatTnd(r.amount)}{r.reference ? ` · ${r.reference}` : ""}</li>)}
          </ul>
          {canWrite && Number(holdback.remaining) > 0 && (
            <form action={releaseHoldbackAction} className="grid gap-3 sm:grid-cols-4 items-end border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <input type="hidden" name="id" value={p.id} />
              <Field label="Montant libéré (DT)"><input className="input" name="amount" inputMode="decimal" required /></Field>
              <Field label="Date"><input className="input" type="date" name="releasedOn" defaultValue={todayTunis()} /></Field>
              <Field label="Référence"><input className="input" name="reference" maxLength={100} placeholder="PV de réception…" /></Field>
              <button className="btn btn-ghost">Enregistrer la libération</button>
              <p className="text-xs sm:col-span-4" style={{ color: "var(--muted)" }}>
                Ceci tient le registre de la retenue. L&apos;encaissement correspondant se saisit dans Paiements (avance du client).
              </p>
            </form>
          )}
        </section>
      )}

      {canWrite && (
        <section className="card p-4 space-y-3">
          <h2 className="font-medium">Paramètres du chantier</h2>
          {!d.canEditLines && (
            <form action={updateProjectMetaAction} className="grid gap-3 sm:grid-cols-4 items-end">
              <input type="hidden" name="id" value={p.id} />
              <Field label="Nom" className="sm:col-span-2"><input className="input" name="name" defaultValue={p.name} required maxLength={200} /></Field>
              <Field label="Retenue de garantie (%)" hint="S'applique aux prochaines situations"><input className="input" name="holdbackPercent" defaultValue={p.holdbackPercent} inputMode="decimal" /></Field>
              <Field label="Description" className="sm:col-span-4"><input className="input" name="description" defaultValue={p.description ?? ""} maxLength={2000} /></Field>
              <button className="btn btn-ghost">Enregistrer</button>
            </form>
          )}
          <div className="flex gap-2 flex-wrap">
            {(["active", "completed", "cancelled"] as const).filter((s) => s !== p.status).map((s) => (
              <form key={s} action={setProjectStatusAction}>
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={s} />
                <button className="btn btn-ghost">{s === "active" ? "Rouvrir" : s === "completed" ? "Marquer comme terminé" : "Annuler le chantier"}</button>
              </form>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
