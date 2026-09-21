import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { todayTunis } from "@/lib/dates";
import { FREQUENCY_LABELS, getRecurringTemplate } from "@/lib/invoicing/recurring";
import { Flash } from "@/components/ui";
import { loadEditorData } from "../../factures/editor-data";
import { InvoiceEditor } from "../../factures/invoice-editor";
import { deleteRecurringAction, runRecurringAction, saveRecurringAction, setRecurringStatusAction } from "../actions";
import { RecurringExtraFields } from "../extra-fields";
import { RECURRING_STATUS_LABELS } from "../labels";

export const dynamic = "force-dynamic";

const dateTimeFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Tunis" });

export default async function RecurringTemplatePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission("recurring:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const d = await getRecurringTemplate(db, id);
  if (!d) notFound();
  const { template: t, lines, customer, runs, upcoming } = d;
  const { ok, error } = await searchParams;
  const canWrite = can(user.role, "recurring:write");
  const editable = canWrite && t.status !== "ended";
  const editorData = editable ? await loadEditorData({ includeCustomerId: t.customerId }) : null;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <span className="text-xs rounded-full px-2 py-0.5 border" style={{ borderColor: "var(--border)" }}>{RECURRING_STATUS_LABELS[t.status]}</span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>{customer?.name} · {FREQUENCY_LABELS[t.frequency]}</span>
      </div>
      <Flash ok={ok} error={error} />

      <section className="card p-4 text-sm space-y-1">
        <p>Prochaines échéances : {upcoming.length ? upcoming.join(" · ") : "aucune"}{t.endDate ? ` (fin le ${t.endDate})` : ""}</p>
        <p style={{ color: "var(--muted)" }}>
          {t.autoValidate ? "Les factures sont validées et numérotées automatiquement." : "Les factures sont créées en brouillon, à relire puis valider."}
          {t.autoSend ? " Elles sont envoyées par e-mail au client." : ""}
        </p>
      </section>

      {editorData && editable && (
        <InvoiceEditor
          action={saveRecurringAction} kind="recurring" invoiceId={t.id}
          customers={editorData.customers} products={editorData.products} tvaRates={editorData.tvaRates}
          paymentTerms={editorData.paymentTerms} fodecRate={editorData.fodecRate} company={editorData.company}
          extraFields={<RecurringExtraFields defaults={{ name: t.name, frequency: t.frequency, endDate: t.endDate ?? "", autoValidate: t.autoValidate, autoSend: t.autoSend }} />}
          initial={{
            customerId: t.customerId, issueDate: t.startDate, dueDate: "", paymentTermId: t.paymentTermId ?? "",
            reference: t.reference ?? "", notes: t.notes ?? "",
            lines: lines.map((l) => ({
              productId: l.productId ?? "", description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
              discountPercent: l.discountPercent, tvaRateId: l.tvaRateId, fodecApplicable: l.fodecApplicable,
            })),
          }}
        />
      )}
      {t.runIndex > 0 && editable && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>Des périodes ont déjà été traitées : la date de début, la fréquence et le client ne sont plus modifiables. Les changements de lignes s&apos;appliquent aux prochaines factures.</p>
      )}

      {canWrite && t.status !== "ended" && (
        <div className="flex gap-2 flex-wrap">
          {t.status === "active" && t.nextRunDate <= todayTunis() && (
            <form action={runRecurringAction}><input type="hidden" name="templateId" value={t.id} /><button className="btn">Générer l&apos;échéance due</button></form>
          )}
          <form action={setRecurringStatusAction}>
            <input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={t.status === "active" ? "paused" : "active"} />
            <button className="btn btn-ghost">{t.status === "active" ? "Mettre en pause" : "Reprendre"}</button>
          </form>
          <form action={setRecurringStatusAction}>
            <input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="ended" />
            <button className="btn btn-ghost" style={{ color: "var(--danger)" }}>Terminer le modèle</button>
          </form>
          {runs.length === 0 && (
            <form action={deleteRecurringAction}><input type="hidden" name="id" value={t.id} /><button className="btn btn-ghost" style={{ color: "var(--danger)" }}>Supprimer</button></form>
          )}
        </div>
      )}

      <section className="card overflow-x-auto">
        <h2 className="font-medium p-4 pb-0">Historique des générations</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Échéance</th><th className="p-3">Résultat</th><th className="p-3">Facture</th><th className="p-3">E-mail</th><th className="p-3">Créé le</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(({ run: r, number, invoiceStatus }) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 whitespace-nowrap">{r.scheduledDate}</td>
                <td className="p-3" style={r.status === "failed" ? { color: "var(--danger)" } : undefined}>{r.status === "generated" ? "Générée" : `Échec : ${r.error}`}</td>
                <td className="p-3 font-mono">
                  {r.invoiceId ? <Link className="underline" href={`/factures/${r.invoiceId}`}>{number ?? (invoiceStatus === "draft" ? "Brouillon" : "—")}</Link> : "—"}
                </td>
                <td className="p-3">{r.emailStatus === "sent" ? "Envoyé" : r.emailStatus === "skipped" ? "Ignoré (pas d'adresse)" : r.emailStatus === "failed" ? `Échec : ${r.emailError}` : "—"}</td>
                <td className="p-3 whitespace-nowrap">{dateTimeFmt.format(r.createdAt)}</td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td className="p-3" colSpan={5} style={{ color: "var(--muted)" }}>Aucune génération pour l&apos;instant.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
