"use client";

import { useState } from "react";
import { formatAmount } from "@/lib/money";

export type DeliveryCustomer = { id: string; code: string; name: string };
export type DeliveryProduct = { id: string; code: string; name: string; unit: string; unitPrice: string; trackStock: boolean; onHand: string | null };
export type DeliveryRow = { productId: string; quantity: string; description: string; unitPrice: string };
export type DeliveryInitial = { customerId: string; issueDate: string; reference: string; notes: string; lines: DeliveryRow[] };

type Row = DeliveryRow & { key: string };
const newKey = () => Math.random().toString(36).slice(2);

/** Éditeur de bon de livraison : produit (avec stock affiché), quantité, désignation et prix facultatifs. */
export function DeliveryEditor({
  action, id, version, customers, products, initial,
}: {
  action: (formData: FormData) => Promise<void>;
  id?: string;
  version?: number;
  customers: DeliveryCustomer[];
  products: DeliveryProduct[];
  initial: DeliveryInitial;
}) {
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [issueDate, setIssueDate] = useState(initial.issueDate);
  const [reference, setReference] = useState(initial.reference);
  const [notes, setNotes] = useState(initial.notes);
  const [rows, setRows] = useState<Row[]>(initial.lines.map((l) => ({ ...l, key: newKey() })));

  const productOf = (pid: string) => products.find((p) => p.id === pid);
  const update = (key: string, patch: Partial<DeliveryRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const payload = JSON.stringify({
    customerId, issueDate, reference, notes,
    lines: rows.map(({ key: _k, ...l }) => l),
  });

  return (
    <form action={action} className="space-y-4">
      {id && <input type="hidden" name="id" value={id} />}
      {version !== undefined && <input type="hidden" name="version" value={version} />}
      <input type="hidden" name="payload" value={payload} />

      <section className="card p-4 grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Client *</span>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="">— Choisir —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Date de livraison *</span>
          <input className="input" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm">Référence (bon de commande…)</span>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
        </label>
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Marchandises livrées</h2>
          <button type="button" className="btn btn-ghost" onClick={() => setRows((rs) => [...rs, { key: newKey(), productId: "", quantity: "1", description: "", unitPrice: "" }])}>+ Ajouter une ligne</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left" style={{ color: "var(--muted)" }}>
                <th className="p-1">Article</th><th className="p-1 w-24">Quantité</th>
                <th className="p-1">Désignation (facultatif)</th><th className="p-1 w-28">Prix HT (facultatif)</th><th className="p-1 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = productOf(r.productId);
                const short = p?.trackStock && p.onHand !== null && Number(r.quantity.replace(",", ".")) > Number(p.onHand);
                return (
                  <tr key={r.key} className="align-top">
                    <td className="p-1">
                      <select className="input" value={r.productId} onChange={(e) => update(r.key, { productId: e.target.value })} required>
                        <option value="">— Choisir —</option>
                        {products.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.code} · {x.name}{x.trackStock ? ` (stock : ${formatAmount(x.onHand ?? "0")})` : ""}
                          </option>
                        ))}
                      </select>
                      {short && <span className="block text-xs" style={{ color: "var(--danger)" }}>Stock insuffisant : {formatAmount(p!.onHand!)} disponible(s)</span>}
                    </td>
                    <td className="p-1"><input className="input" inputMode="decimal" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} required /></td>
                    <td className="p-1"><input className="input" value={r.description} placeholder={p?.name ?? ""} onChange={(e) => update(r.key, { description: e.target.value })} maxLength={500} /></td>
                    <td className="p-1"><input className="input" inputMode="decimal" value={r.unitPrice} placeholder={p ? formatAmount(p.unitPrice) : ""} onChange={(e) => update(r.key, { unitPrice: e.target.value })} /></td>
                    <td className="p-1"><button type="button" className="btn btn-ghost !px-2" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Supprimer la ligne">×</button></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td className="p-3" colSpan={5} style={{ color: "var(--muted)" }}>Aucune ligne.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Le prix et la TVA sont copiés de l&apos;article à l&apos;enregistrement : la facture reprendra ces valeurs. Un bon ne porte que sur des biens.
        </p>
      </section>

      <label className="card p-4 block space-y-1">
        <span className="text-sm">Notes</span>
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
      </label>
      <button className="btn" disabled={rows.length === 0 || !customerId}>Enregistrer le brouillon</button>
    </form>
  );
}
