import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { getQuote } from "@/lib/invoicing/quotes";
import { formatAmount, formatPercent, formatTnd } from "@/lib/money";
import { Flash } from "@/components/ui";
import { SendPanel } from "@/components/send-panel";
import { defaultRecipient, emailHistory } from "@/lib/mail/documents";
import { loadEditorData } from "../../factures/editor-data";
import { InvoiceEditor } from "../../factures/invoice-editor";
import {
  createDepositAction, createFinalInvoiceAction, decideQuoteAction, deleteQuoteAction, saveQuoteAction,
  sendQuoteAction, sendQuoteEmailAction,
} from "../actions";
import { QUOTE_LABELS } from "../labels";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "long", timeZone: "UTC" });
const fmtDate = (d: string | null) => (d ? dateFmt.format(new Date(`${d}T00:00:00Z`)) : "—");

export default async function QuotePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission("quotes:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const details = await getQuote(db, id);
  if (!details) notFound();
  const { quote: q, lines, customer, taxes, deposits, finalInvoice, expired } = details;
  const { ok, error } = await searchParams;
  const canWrite = can(user.role, "quotes:write");
  const canInvoice = can(user.role, "invoices:write");
  const mailTo = q.status === "draft" ? null : await defaultRecipient(db, q.customerId);
  const mails = q.status === "draft" ? [] : await emailHistory(db, { quoteId: q.id });

  const header = (
    <div className="flex items-center gap-3 flex-wrap">
      <h1 className="text-2xl font-semibold">Devis {q.number ?? "(brouillon)"}</h1>
      <span className="text-xs rounded-full px-2 py-0.5 border" style={{ borderColor: "var(--border)" }}>{QUOTE_LABELS[q.status]}</span>
      {expired && <span className="text-xs" style={{ color: "var(--danger)" }}>expiré le {fmtDate(q.validUntil)}</span>}
    </div>
  );

  // ---- Brouillon -----------------------------------------------------------------------------
  if (q.status === "draft" && canWrite) {
    const data = await loadEditorData({ includeCustomerId: q.customerId });
    const rateIdOf = (code: string) =>
      data.allTvaRates.find((t) => t.code === code)?.id ?? data.allTvaRates.find((t) => t.code === "TVA0")?.id ?? "";
    return (
      <div className="space-y-4 max-w-6xl">
        {header}
        <p className="text-sm"><a className="underline" href={`/devis/${q.id}/pdf`} target="_blank" rel="noopener">Aperçu PDF (brouillon)</a></p>
        <Flash ok={ok} error={error} />
        <InvoiceEditor
          action={saveQuoteAction} kind="quote" invoiceId={q.id} version={q.version}
          customers={data.customers} products={data.products} tvaRates={data.tvaRates}
          paymentTerms={data.paymentTerms} fodecRate={data.fodecRate} company={data.company}
          initial={{
            customerId: q.customerId, issueDate: q.issueDate, dueDate: q.validUntil ?? "", paymentTermId: "",
            reference: q.reference ?? "", notes: q.notes ?? "",
            lines: lines.map((l) => ({
              productId: l.productId ?? "", description: l.description, quantity: l.quantity, unit: l.unit,
              unitPrice: l.unitPrice, discountPercent: l.discountPercent, tvaRateId: rateIdOf(l.tvaCode),
              fodecApplicable: Number(l.fodecRate) > 0,
            })),
          }}
        />
        <div className="flex gap-3 flex-wrap items-start">
          <form action={sendQuoteAction} className="space-y-1">
            <input type="hidden" name="id" value={q.id} />
            <button className="btn">Envoyer et numéroter</button>
            <p className="text-xs max-w-md" style={{ color: "var(--muted)" }}>
              L&apos;envoi attribue le numéro définitif et verrouille le devis. Enregistrez d&apos;abord vos modifications.
            </p>
          </form>
          <form action={deleteQuoteAction}>
            <input type="hidden" name="id" value={q.id} />
            <button className="btn btn-ghost" style={{ color: "var(--danger)" }}>Supprimer le brouillon</button>
          </form>
        </div>
      </div>
    );
  }

  // ---- Devis envoyé / accepté / refusé : lecture seule --------------------------------------
  return (
    <div className="space-y-4 max-w-4xl">
      {header}
      <Flash ok={ok} error={error} />

      <div className="card p-4 space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div>
            <p className="font-medium">{customer?.name}</p>
            {customer?.matriculeFiscal && <p>MF : {customer.matriculeFiscal}</p>}
          </div>
          <div className="sm:text-right">
            <p>Émission : {fmtDate(q.issueDate)}</p>
            <p>Valable jusqu&apos;au : {fmtDate(q.validUntil)}</p>
            {q.reference && <p>Réf. : {q.reference}</p>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left" style={{ color: "var(--muted)" }}>
                <th className="p-2">Désignation</th><th className="p-2 text-right">Qté</th><th className="p-2 text-right">Prix HT</th>
                <th className="p-2 text-right">Remise</th><th className="p-2 text-right">TVA</th><th className="p-2 text-right">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-2">{l.description}</td>
                  <td className="p-2 text-right whitespace-nowrap">{formatAmount(l.quantity)} {l.unit}</td>
                  <td className="p-2 text-right whitespace-nowrap">{formatAmount(l.unitPrice)}</td>
                  <td className="p-2 text-right">{Number(l.discountPercent) > 0 ? formatPercent(l.discountPercent) : "—"}</td>
                  <td className="p-2 text-right">{l.tvaCode === "EXO" ? "Exo." : formatPercent(l.tvaRate)}</td>
                  <td className="p-2 text-right whitespace-nowrap">{formatAmount(l.lineNetHt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto max-w-sm space-y-1 text-sm">
          <Row label="Total HT" value={q.totalHt} />
          {Number(q.totalFodec) > 0 && <Row label="FODEC" value={q.totalFodec} />}
          {taxes.filter((t) => t.kind === "tva").map((t) => (
            <Row key={t.rate} label={`TVA ${formatPercent(t.rate)} sur ${formatAmount(t.base)}`} value={t.amount} muted />
          ))}
          <Row label="Total TTC" value={q.totalTtc} strong />
        </div>
        {q.notes && <p className="text-sm whitespace-pre-wrap border-t pt-3" style={{ borderColor: "var(--border)" }}>{q.notes}</p>}
        <p className="text-xs" style={{ color: "var(--muted)" }}>Le timbre fiscal et la retenue à la source n&apos;apparaissent qu&apos;à la facture.</p>
      </div>

      <SendPanel
        pdfHref={`/devis/${q.id}/pdf`} action={sendQuoteEmailAction} id={q.id}
        canSend={canWrite} defaultTo={mailTo} history={mails}
      />

      {q.status === "sent" && canWrite && (
        <div className="flex gap-2 flex-wrap">
          <form action={decideQuoteAction}>
            <input type="hidden" name="id" value={q.id} /><input type="hidden" name="decision" value="accepted" />
            <button className="btn" disabled={expired}>Marquer comme accepté</button>
          </form>
          <form action={decideQuoteAction}>
            <input type="hidden" name="id" value={q.id} /><input type="hidden" name="decision" value="declined" />
            <button className="btn btn-ghost">Marquer comme refusé</button>
          </form>
        </div>
      )}

      {q.status === "accepted" && (
        <section className="card p-4 space-y-3">
          <h2 className="font-medium">Facturation</h2>
          {deposits.length > 0 && (
            <ul className="text-sm space-y-1">
              {deposits.map((d) => (
                <li key={d.id}>
                  Acompte {formatPercent(d.depositPercent ?? "0")} :{" "}
                  <Link className="underline" href={`/factures/${d.id}`}>{d.number ?? "brouillon"}</Link>
                  {" "}· {formatTnd(d.totalTtc)} TTC · {d.status === "draft" ? "brouillon" : "validé"}
                </li>
              ))}
            </ul>
          )}
          {finalInvoice ? (
            <p className="text-sm">
              Facture finale : <Link className="underline" href={`/factures/${finalInvoice.id}`}>{finalInvoice.number ?? "brouillon"}</Link>
            </p>
          ) : canInvoice ? (
            <div className="flex gap-4 flex-wrap items-end">
              <form action={createDepositAction} className="flex gap-2 items-end">
                <input type="hidden" name="id" value={q.id} />
                <label className="block space-y-1">
                  <span className="text-sm">Acompte (% du devis)</span>
                  <input className="input !w-28" name="percent" inputMode="decimal" defaultValue="30" required />
                </label>
                <button className="btn btn-ghost">Créer l&apos;acompte</button>
              </form>
              <form action={createFinalInvoiceAction}>
                <input type="hidden" name="id" value={q.id} />
                <button className="btn">Créer la facture finale</button>
              </form>
              <p className="text-xs basis-full" style={{ color: "var(--muted)" }}>
                Déjà facturé en acompte : {formatPercent(details.depositPercent)}. Les acomptes validés sont déduits de la facture finale.
              </p>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold border-t pt-2" : ""}`} style={strong ? { borderColor: "var(--border)" } : muted ? { color: "var(--muted)" } : undefined}>
      <span>{label}</span><span className="whitespace-nowrap">{formatTnd(value)}</span>
    </div>
  );
}
