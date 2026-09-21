import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { getDeliveryNote } from "@/lib/delivery";
import { formatAmount, formatPercent, formatTnd } from "@/lib/money";
import { Flash } from "@/components/ui";
import { cancelDeliveryAction, deleteDeliveryAction, saveDeliveryAction, validateDeliveryAction } from "../actions";
import { DeliveryEditor } from "../delivery-editor";
import { loadDeliveryEditorData } from "../editor-data";
import { DeliveryBadge } from "@/components/status-badges";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "long", timeZone: "UTC" });

export default async function DeliveryNotePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission("delivery:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const details = await getDeliveryNote(db, id);
  if (!details) notFound();
  const { note: n, lines, customer } = details;
  const { ok, error } = await searchParams;
  const canWrite = can(user.role, "delivery:write");
  const canValidate = can(user.role, "delivery:validate");

  const header = (
    <div className="flex items-center gap-3 flex-wrap">
      <h1 className="text-2xl font-semibold">Bon de livraison {n.number ?? "(brouillon)"}</h1>
      <DeliveryBadge status={n.status} />
    </div>
  );
  const pdfLink = (
    <p className="text-sm">
      <a className="underline" href={`/livraisons/${n.id}/pdf`} target="_blank" rel="noopener">{n.status === "draft" ? "Aperçu PDF (brouillon)" : "Ouvrir le PDF"}</a>
      {n.status !== "draft" && <> · <a className="underline" href={`/livraisons/${n.id}/pdf?download=1`}>Télécharger</a></>}
    </p>
  );

  if (n.status === "draft" && canWrite) {
    const data = await loadDeliveryEditorData({ includeCustomerId: n.customerId });
    return (
      <div className="space-y-4 max-w-5xl">
        {header}
        {pdfLink}
        <Flash ok={ok} error={error} />
        <DeliveryEditor
          action={saveDeliveryAction} id={n.id} version={n.version} customers={data.customers} products={data.products}
          initial={{
            customerId: n.customerId, issueDate: n.issueDate, reference: n.reference ?? "", notes: n.notes ?? "",
            lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, description: l.description, unitPrice: l.unitPrice })),
          }}
        />
        <div className="flex gap-3 flex-wrap items-start">
          {canValidate && (
            <form action={validateDeliveryAction} className="space-y-1">
              <input type="hidden" name="id" value={n.id} />
              <button className="btn">Valider et sortir du stock</button>
              <p className="text-xs max-w-md" style={{ color: "var(--muted)" }}>
                La validation attribue le numéro définitif, retire les quantités du stock et verrouille le bon. Enregistrez d&apos;abord vos modifications.
              </p>
            </form>
          )}
          <form action={deleteDeliveryAction}>
            <input type="hidden" name="id" value={n.id} />
            <button className="btn btn-ghost" style={{ color: "var(--danger)" }}>Supprimer le brouillon</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {header}
      {pdfLink}
      <Flash ok={ok} error={error} />
      <div className="card p-4 space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div><p className="font-medium">{customer?.name}</p>{customer?.address && <p>{customer.address}</p>}</div>
          <div className="sm:text-right">
            <p>Livraison : {dateFmt.format(new Date(`${n.issueDate}T00:00:00Z`))}</p>
            {n.reference && <p>Réf. : {n.reference}</p>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left" style={{ color: "var(--muted)" }}>
                <th className="p-2">Désignation</th><th className="p-2 text-right">Quantité</th><th className="p-2 text-right">Prix HT</th><th className="p-2 text-right">TVA</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-2">{l.description}</td>
                  <td className="p-2 text-right whitespace-nowrap">{formatAmount(l.quantity)} {l.unit}</td>
                  <td className="p-2 text-right whitespace-nowrap">{formatTnd(l.unitPrice)}</td>
                  <td className="p-2 text-right">{l.tvaCode === "EXO" ? "Exo." : formatPercent(l.tvaRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {n.notes && <p className="text-sm whitespace-pre-wrap border-t pt-3" style={{ borderColor: "var(--border)" }}>{n.notes}</p>}
        {n.status === "cancelled" && <p className="text-sm" style={{ color: "var(--danger)" }}>Annulé : {n.cancelReason}</p>}
        {n.invoiceId && <p className="text-sm">Repris dans la <Link className="underline" href={`/factures/${n.invoiceId}`}>facture</Link>.</p>}
      </div>

      {n.status === "validated" && !n.invoiceId && canValidate && (
        <form action={cancelDeliveryAction} className="card p-4 flex gap-2 flex-wrap items-end">
          <input type="hidden" name="id" value={n.id} />
          <label className="block space-y-1 flex-1 min-w-64">
            <span className="text-sm">Annuler ce bon (la marchandise revient en stock) — motif *</span>
            <input className="input" name="reason" required minLength={3} maxLength={300} placeholder="Client absent, erreur de saisie…" />
          </label>
          <button className="btn btn-ghost" style={{ color: "var(--danger)" }}>Annuler le bon</button>
        </form>
      )}
    </div>
  );
}
