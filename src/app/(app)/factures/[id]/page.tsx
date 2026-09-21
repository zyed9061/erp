import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import { PAYMENT_METHODS, quotes } from "@/db/schema";
import { todayTunis } from "@/lib/dates";
import { getInvoice, verifyInvoiceIntegrity } from "@/lib/invoicing/invoices";
import {
  getInvoiceBalance, listWithholdingCertificates, paymentStateOf, paymentsOfInvoice,
} from "@/lib/invoicing/payments";
import { addCertificateAction, recordPaymentAction } from "../../paiements/actions";
import { SendPanel } from "@/components/send-panel";
import { actionLabel, entityHistory } from "@/lib/audit";
import { isDemoMode } from "@/lib/demo/mode";
import { getEinvoiceStatus } from "@/lib/einvoice/service";
import { listSubmissions } from "@/lib/einvoice/submission";
import { defaultRecipient, emailHistory } from "@/lib/mail/documents";
import { METHOD_LABELS } from "../../paiements/labels";
import { formatAmount, formatPercent, formatTnd } from "@/lib/money";
import { Field, Flash } from "@/components/ui";
import {
  createCreditNoteAction, deleteDraftAction, prepareEinvoiceAction, saveInvoiceAction, submitTtnAction, sendInvoiceEmailAction, validateInvoiceAction,
} from "../actions";
import { loadEditorData } from "../editor-data";
import { InvoiceEditor } from "../invoice-editor";
import { InvoiceStatusBadge, PaymentBadge } from "@/components/status-badges";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "long", timeZone: "UTC" });
const fmtDate = (d: string | null) => (d ? dateFmt.format(new Date(`${d}T00:00:00Z`)) : "—");

export default async function InvoicePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission("invoices:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const details = await getInvoice(db, id);
  if (!details) notFound();
  const { invoice: inv, lines, taxes, customer, credits, original } = details;
  const { ok, error } = await searchParams;
  const isCredit = inv.kind === "credit_note";
  const KIND_TITLES = { invoice: "Facture", credit_note: "Avoir", deposit_invoice: "Facture d'acompte" } as const;
  const title = `${KIND_TITLES[inv.kind]} ${inv.number ?? "(brouillon)"}`;
  const [linkedQuote] = inv.quoteId ? await db.select().from(quotes).where(eq(quotes.id, inv.quoteId)) : [];
  const quoteLink = linkedQuote ? (
    <p className="text-sm">
      Issue du devis <Link className="underline" href={`/devis/${linkedQuote.id}`}>{linkedQuote.number}</Link>
      {inv.kind === "deposit_invoice" ? ` (acompte de ${formatPercent(inv.depositPercent ?? "0")})` : ""}.
    </p>
  ) : null;
  const projectLink = inv.projectId ? (
    <p className="text-sm">Situation de travaux : <Link className="underline" href={`/chantiers/${inv.projectId}`}>voir le chantier</Link>.</p>
  ) : null;

  const header = (
    <div className="flex items-center gap-3 flex-wrap">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <InvoiceStatusBadge status={inv.status} kind={inv.kind} />
    </div>
  );

  // ---- Brouillon : éditeur + validation -----------------------------------------------------
  if (inv.status === "draft") {
    const canWrite = can(user.role, "invoices:write");
    const canValidate = can(user.role, "invoices:validate");
    const data = await loadEditorData({ includeCustomerId: inv.customerId });
    const tva0 = data.allTvaRates.find((t) => t.code === "TVA0") ?? data.allTvaRates[0];
    const rateIdOf = (code: string) => data.allTvaRates.find((t) => t.code === code)?.id ?? tva0?.id ?? "";

    return (
      <div className="space-y-4 max-w-6xl">
        {header}
        {isCredit && original && (
          <p className="text-sm">
            Avoir sur la facture <Link className="underline" href={`/factures/${original.id}`}>{original.number}</Link>
            {" "}— motif : {inv.creditReason}. Le timbre n&apos;est pas remboursé ; la retenue de la facture d&apos;origine est reprise.
          </p>
        )}
        {quoteLink}
{projectLink}
        <p className="text-sm"><a className="underline" href={`/factures/${inv.id}/pdf`} target="_blank" rel="noopener">Aperçu PDF (brouillon)</a></p>
        <Flash ok={ok} error={error} />
        {canWrite ? (
          <InvoiceEditor
            action={saveInvoiceAction}
            kind={inv.kind}
            invoiceId={inv.id}
            version={inv.version}
            customers={data.customers}
            products={data.products}
            tvaRates={data.tvaRates}
            paymentTerms={data.paymentTerms}
            fodecRate={data.fodecRate}
            company={data.company}
            creditWithholdingRate={inv.withholdingRate}
            guaranteeHoldbackRate={inv.guaranteeHoldbackRate}
            initial={{
              customerId: inv.customerId, issueDate: inv.issueDate, dueDate: inv.dueDate ?? "",
              paymentTermId: inv.paymentTermId ?? "", reference: inv.reference ?? "", notes: inv.notes ?? "",
              lines: lines.map((l) => ({
                productId: l.productId ?? "", description: l.description, quantity: l.quantity, unit: l.unit,
                unitPrice: l.unitPrice, discountPercent: l.discountPercent, tvaRateId: rateIdOf(l.tvaCode),
                fodecApplicable: Number(l.fodecRate) > 0,
              })),
            }}
          />
        ) : (
          <DocumentBody inv={inv} lines={lines} taxes={taxes} customerName={customer?.name ?? ""} />
        )}

        <div className="flex gap-3 flex-wrap items-start">
          {canValidate && (
            <form action={validateInvoiceAction} className="space-y-1">
              <input type="hidden" name="id" value={inv.id} />
              <button className="btn">Valider et numéroter</button>
              <p className="text-xs max-w-md" style={{ color: "var(--muted)" }}>
                La validation attribue le numéro définitif et verrouille le document. Enregistrez d&apos;abord vos modifications.
                Après validation, seule la création d&apos;un avoir permet de corriger.
              </p>
            </form>
          )}
          {canWrite && (
            <form action={deleteDraftAction}>
              <input type="hidden" name="id" value={inv.id} />
              <button className="btn btn-ghost" style={{ color: "var(--danger)" }}>Supprimer le brouillon</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ---- Document validé : lecture seule ---------------------------------------------------------
  const intact = await verifyInvoiceIntegrity(db, inv.id);
  const canWrite = can(user.role, "invoices:write");
  const remaining = details.remainingCreditable;
  const canPay = can(user.role, "payments:write");
  const balance = !isCredit ? await getInvoiceBalance(db, inv.id) : null;
  const pay = balance ? paymentStateOf(balance, inv.dueDate) : null;
  const paymentRows = !isCredit ? await paymentsOfInvoice(db, inv.id) : [];
  const hasWithholding = !isCredit && Number(inv.withholdingAmount) > 0;
  const certificates = hasWithholding ? await listWithholdingCertificates(db, inv.id) : [];
  const certified = certificates.reduce((sum, c) => sum + Number(c.amount), 0);
  const mailTo = await defaultRecipient(db, inv.customerId);
  const mails = await emailHistory(db, { invoiceId: inv.id });
  const teif = await getEinvoiceStatus(db, inv.id);
  const canPrepareTeif = can(user.role, "invoices:validate");
  const demo = isDemoMode();
  const submissions = demo && teif.readiness ? await listSubmissions(db, inv.id) : [];
  const accepted = submissions.find((x) => x.status === "accepted") ?? null;
  const history = can(user.role, "audit:read") ? await entityHistory(db, "invoice", inv.id) : null;

  return (
    <div className="space-y-4 max-w-4xl">
      {header}
      {pay && (
        <p className="text-sm flex items-center gap-2 flex-wrap">
          <PaymentBadge status={pay.status} overdue={pay.overdue} />
          {pay.overdue && <span style={{ color: "var(--muted)" }}>échéance dépassée : {inv.dueDate}</span>}
        </p>
      )}
      {quoteLink}
{projectLink}
      <Flash ok={ok} error={error} />
      {!intact && (
        <p role="alert" className="card p-3 text-sm" style={{ color: "var(--danger)" }}>
          Attention : l&apos;empreinte de ce document ne correspond plus à son contenu. Contactez un administrateur.
        </p>
      )}
      {isCredit && original && (
        <p className="text-sm">
          Avoir sur la facture <Link className="underline" href={`/factures/${original.id}`}>{original.number}</Link> — motif : {inv.creditReason}
        </p>
      )}
      <DocumentBody inv={inv} lines={lines} taxes={taxes} customerName={customer?.name ?? ""} />

      <SendPanel
        pdfHref={`/factures/${inv.id}/pdf`} action={sendInvoiceEmailAction} id={inv.id}
        canSend={canWrite} defaultTo={mailTo} history={mails}
      />

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Validé le {inv.validatedAt ? new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Tunis" }).format(inv.validatedAt) : "—"}
        {" "}· empreinte {inv.contentHash?.slice(0, 12)}… {intact ? "(intègre)" : "(ALTÉRÉE)"}
      </p>


      {teif.readiness && (
        <section className="card p-4 space-y-3">
          <h2 className="font-medium">Facture électronique (TEIF) — préparation</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Fichier XML préparé à partir des données figées de la facture. Il n&apos;est ni signé ni transmis à TTN, et son format
            n&apos;a pas été validé contre la spécification officielle : ne pas l&apos;utiliser en l&apos;état.
          </p>
          {teif.readiness.errors.length > 0 && (
            <ul role="alert" className="text-sm list-disc pl-5 space-y-1" style={{ color: "var(--danger)" }}>
              {teif.readiness.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer">Points d&apos;attention ({teif.readiness.warnings.length})</summary>
            <ul className="list-disc pl-5 space-y-1 mt-2" style={{ color: "var(--muted)" }}>
              {teif.readiness.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </details>
          <div className="flex gap-3 items-center flex-wrap">
            {teif.latest ? (
              <>
                <a className="btn btn-ghost" href={`/factures/${inv.id}/teif`}>Télécharger le XML</a>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  Préparé le {new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Tunis" }).format(teif.latest.createdAt)}
                  {" "}· empreinte {teif.latest.xmlSha256.slice(0, 12)}…
                </span>
              </>
            ) : canPrepareTeif && teif.readiness.errors.length === 0 ? (
              <form action={prepareEinvoiceAction}>
                <input type="hidden" name="id" value={inv.id} />
                <button className="btn btn-ghost">Préparer le fichier TEIF</button>
              </form>
            ) : (
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                {teif.readiness.errors.length > 0 ? "Corrigez les points ci-dessus pour préparer le fichier." : "Aucun fichier préparé."}
              </span>
            )}
          </div>
        </section>
      )}

      {demo && teif.readiness && (
        <section className="card p-4 space-y-3" style={{ borderColor: "var(--danger)" }}>
          <h2 className="font-medium">Envoi à la TTN — SIMULATION (démonstration)</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            La signature, la TTN et le QR code sont simulés : rien n&apos;est transmis, rien n&apos;a de valeur légale. Le circuit :
            préparer le fichier, le signer (signature de démonstration), l&apos;envoyer à la TTN simulée, recevoir une référence.
          </p>
          {accepted ? (
            <div className="space-y-1 text-sm">
              <p><strong>Accepté par la TTN simulée</strong> · référence <span className="font-mono">{accepted.ttnReference}</span></p>
              <p style={{ color: "var(--muted)" }}>Le PDF de la facture porte maintenant un QR code de démonstration.</p>
              <p><a className="underline" href={`/factures/${inv.id}/teif?signed=1`}>Télécharger le XML signé (démonstration)</a></p>
            </div>
          ) : canPrepareTeif && teif.readiness.errors.length === 0 ? (
            <form action={submitTtnAction}>
              <input type="hidden" name="id" value={inv.id} />
              <button className="btn btn-ghost">Préparer, signer et envoyer (SIMULATION)</button>
            </form>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {teif.readiness.errors.length > 0 ? "Corrigez d'abord les points de la carte TEIF ci-dessus." : "Seuls l'administrateur et le comptable peuvent envoyer."}
            </p>
          )}
          {submissions.length > 0 && (
            <ul className="text-sm space-y-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
              {submissions.map((x) => (
                <li key={x.id}>
                  {new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Tunis" }).format(x.createdAt)}
                  {" "}· {x.status === "accepted" ? "Accepté" : "Rejeté"} · {x.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {pay && (
        <section className="card p-4 space-y-3">
          <h2 className="font-medium">Paiements</h2>
          <div className="grid gap-1 text-sm sm:grid-cols-2">
            <p>Net à payer : {formatTnd(pay.netToPay)}</p>
            <p>Avoirs validés : {formatTnd(pay.credited)}</p>
            <p>Payé : {formatTnd(pay.paid)}</p>
            <p><strong>Reste dû : {formatTnd(pay.due)}</strong>{pay.status === "overpaid" ? " (à rembourser)" : ""}</p>
          </div>
          {paymentRows.length > 0 && (
            <ul className="text-sm space-y-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
              {paymentRows.map(({ payment: p, amount }) => (
                <li key={p.id} style={{ opacity: p.voidedAt ? 0.55 : 1 }}>
                  <Link className="underline" href={`/paiements/${p.id}`}>{p.paymentDate}</Link>
                  {" "}· {METHOD_LABELS[p.method]}{p.reference ? ` ${p.reference}` : ""} · {formatTnd(amount)}
                  {p.voidedAt ? " · annulé" : ""}
                </li>
              ))}
            </ul>
          )}
          {canPay && Number(pay.due) > 0 && (
            <form action={recordPaymentAction} className="grid gap-3 sm:grid-cols-4 items-end border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <input type="hidden" name="customerId" value={inv.customerId} />
              <input type="hidden" name="next" value={`/factures/${inv.id}`} />
              <Field label="Montant encaissé (DT)"><input className="input" name={`alloc_${inv.id}`} inputMode="decimal" defaultValue={pay.due} required /></Field>
              <Field label="Date"><input className="input" type="date" name="paymentDate" defaultValue={todayTunis()} required /></Field>
              <Field label="Mode">
                <select className="input" name="method" defaultValue="virement">
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                </select>
              </Field>
              <Field label="Référence"><input className="input" name="reference" maxLength={100} /></Field>
              <div className="sm:col-span-4"><button className="btn">Enregistrer l&apos;encaissement</button></div>
            </form>
          )}
        </section>
      )}

      {hasWithholding && (
        <section className="card p-4 space-y-3">
          <h2 className="font-medium">Retenue à la source</h2>
          <p className="text-sm">
            Retenue de cette facture : {formatTnd(inv.withholdingAmount)} · certificats reçus : {formatTnd(certified.toFixed(3))}
          </p>
          <ul className="text-sm space-y-1">
            {certificates.map((c) => <li key={c.id}>{c.number} · {c.certificateDate} · {formatTnd(c.amount)}</li>)}
          </ul>
          {canPay && (
            <form action={addCertificateAction} className="grid gap-3 sm:grid-cols-4 items-end border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <input type="hidden" name="invoiceId" value={inv.id} />
              <Field label="N° du certificat"><input className="input" name="number" required maxLength={60} /></Field>
              <Field label="Date"><input className="input" type="date" name="certificateDate" defaultValue={todayTunis()} required /></Field>
              <Field label="Montant (DT)"><input className="input" name="amount" inputMode="decimal" required /></Field>
              <button className="btn btn-ghost">Ajouter le certificat</button>
            </form>
          )}
        </section>
      )}

      {!isCredit && (
        <section className="card p-4 space-y-3">
          <h2 className="font-medium">Avoirs</h2>
          {credits.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>Aucun avoir.</p>}
          <ul className="text-sm space-y-1">
            {credits.map((c) => (
              <li key={c.id}>
                <Link className="underline" href={`/factures/${c.id}`}>{c.number ?? "Brouillon"}</Link>
                {" "}· {formatTnd(c.totalTtc)} TTC · {c.status === "draft" ? "brouillon" : "validé"}
              </li>
            ))}
          </ul>
          <p className="text-sm">Déjà crédité (validé) : {formatTnd(details.creditedTtc)} · reste à créditer : {formatTnd(remaining ?? "0.000")} TTC</p>
          {canWrite && remaining !== null && Number(remaining) > 0 && (
            <form action={createCreditNoteAction} className="flex gap-2 flex-wrap items-end">
              <input type="hidden" name="id" value={inv.id} />
              <label className="block space-y-1 flex-1 min-w-64">
                <span className="text-sm">Motif de l&apos;avoir *</span>
                <input className="input" name="reason" required minLength={3} maxLength={500} placeholder="Retour de marchandise, erreur de prix…" />
              </label>
              <button className="btn btn-ghost">Créer un avoir</button>
            </form>
          )}
        </section>
      )}

      {history && history.length > 0 && (
        <section className="card p-4 space-y-2">
          <h2 className="font-medium">Historique des opérations</h2>
          <ol className="text-sm space-y-1">
            {history.map((h) => (
              <li key={h.id}>
                <span className="tabular-nums" style={{ color: "var(--muted)" }}>
                  {new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Tunis" }).format(h.at)}
                </span>
                {" "}· {actionLabel(h.action)}{h.userEmail ? ` · ${h.userEmail}` : ""}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function DocumentBody({
  inv, lines, taxes, customerName,
}: {
  inv: NonNullable<Awaited<ReturnType<typeof getInvoice>>>["invoice"];
  lines: NonNullable<Awaited<ReturnType<typeof getInvoice>>>["lines"];
  taxes: NonNullable<Awaited<ReturnType<typeof getInvoice>>>["taxes"];
  customerName: string;
}) {
  const snapshot = inv.customerSnapshot as { name?: string; matriculeFiscal?: string | null; address?: string | null; city?: string | null } | null;
  const name = snapshot?.name ?? customerName;
  return (
    <div className="card p-4 space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <div>
          <p className="font-medium">{name}</p>
          {snapshot?.matriculeFiscal && <p>MF : {snapshot.matriculeFiscal}</p>}
          {(snapshot?.address || snapshot?.city) && <p>{[snapshot.address, snapshot.city].filter(Boolean).join(", ")}</p>}
        </div>
        <div className="sm:text-right">
          <p>Émission : {fmtDate(inv.issueDate)}</p>
          {inv.dueDate && <p>Échéance : {fmtDate(inv.dueDate)}</p>}
          {inv.reference && <p>Réf. : {inv.reference}</p>}
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
                <td className="p-2">{l.description}{Number(l.fodecRate) > 0 && <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>FODEC</span>}</td>
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
        <Row label="Total HT" value={inv.totalHt} />
        {Number(inv.totalFodec) > 0 && <Row label="FODEC" value={inv.totalFodec} />}
        {taxes.filter((t) => t.kind === "tva").map((t) => (
          <Row key={t.rate} label={`TVA ${formatPercent(t.rate)} sur ${formatAmount(t.base)}`} value={t.amount} muted />
        ))}
        <Row label="Total TTC" value={inv.totalTtc} strong />
        {Number(inv.stampDuty) > 0 && <Row label="Timbre fiscal" value={inv.stampDuty} />}
        {Number(inv.withholdingAmount) > 0 && <Row label={`Retenue à la source (${formatPercent(inv.withholdingRate ?? "0")})`} value={`-${inv.withholdingAmount}`} />}
        {Number(inv.guaranteeHoldback) > 0 && <Row label={`Retenue de garantie (${formatPercent(inv.guaranteeHoldbackRate ?? "0")})`} value={`-${inv.guaranteeHoldback}`} />}
        <Row label="Net à payer" value={inv.netToPay} strong />
      </div>
      {inv.notes && <p className="text-sm whitespace-pre-wrap border-t pt-3" style={{ borderColor: "var(--border)" }}>{inv.notes}</p>}
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
