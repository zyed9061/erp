"use client";

import { useMemo, useState } from "react";
import { calculateInvoice } from "@/lib/invoicing/calc";
import { formatAmount, formatPercent, parseAmount } from "@/lib/money";

export type ProjectCustomer = { id: string; code: string; name: string };
export type ProjectRate = { id: string; code: string; label: string; rate: string };
export type ProjectRow = { description: string; unit: string; quantity: string; unitPrice: string; tvaRateId: string };
export type ProjectInitial = { name: string; description: string; customerId: string; holdbackPercent: string; lines: ProjectRow[] };

type Row = ProjectRow & { key: string };
const newKey = () => Math.random().toString(36).slice(2);

/** Éditeur de chantier : bordereau (postes du marché) avec total du marché en direct. */
export function ProjectEditor({
  action, id, customers, tvaRates, initial, submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  id?: string;
  customers: ProjectCustomer[];
  tvaRates: ProjectRate[];
  initial: ProjectInitial;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [holdback, setHolding] = useState(initial.holdbackPercent);
  const [rows, setRows] = useState<Row[]>(initial.lines.map((l) => ({ ...l, key: newKey() })));

  const update = (key: string, patch: Partial<ProjectRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const tva19 = tvaRates.find((t) => t.code === "TVA19")?.id ?? tvaRates[0]?.id ?? "";

  const totals = useMemo(() => {
    try {
      if (rows.length === 0) return null;
      return calculateInvoice(
        rows.map((r) => ({
          quantity: parseAmount(r.quantity), unitPrice: parseAmount(r.unitPrice), discountPercent: "0",
          tvaRate: tvaRates.find((t) => t.id === r.tvaRateId)?.rate ?? "0", fodecRate: "0",
        })),
        { stampDuty: "0", withholdingRate: null, withholdingBase: "ttc", withholdingThreshold: "0" },
      ).totals;
    } catch {
      return null;
    }
  }, [rows, tvaRates]);

  const payload = JSON.stringify({
    name, description, customerId, holdbackPercent: holdback || "0",
    lines: rows.map(({ key: _k, ...l }) => l),
  });

  return (
    <form action={action} className="space-y-4">
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="payload" value={payload} />

      <section className="card p-4 grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm">Nom du chantier *</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Client (maître d&apos;ouvrage) *</span>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="">— Choisir —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Retenue de garantie (% du TTC)</span>
          <input className="input" inputMode="decimal" value={holdback} onChange={(e) => setHolding(e.target.value)} placeholder="10" />
          <span className="block text-xs" style={{ color: "var(--muted)" }}>0 si aucune. À confirmer selon votre marché.</span>
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm">Description</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </label>
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Bordereau du marché</h2>
          <button type="button" className="btn btn-ghost" onClick={() => setRows((rs) => [...rs, { key: newKey(), description: "", unit: "u", quantity: "1", unitPrice: "0", tvaRateId: tva19 }])}>+ Ajouter un poste</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left" style={{ color: "var(--muted)" }}>
                <th className="p-1">Poste</th><th className="p-1 w-20">Unité</th><th className="p-1 w-28">Quantité</th>
                <th className="p-1 w-32">Prix unitaire HT</th><th className="p-1 w-28">TVA</th><th className="p-1 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="align-top">
                  <td className="p-1"><input className="input" value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} required maxLength={500} /></td>
                  <td className="p-1"><input className="input" value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} required maxLength={30} /></td>
                  <td className="p-1"><input className="input" inputMode="decimal" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} required /></td>
                  <td className="p-1"><input className="input" inputMode="decimal" value={r.unitPrice} onChange={(e) => update(r.key, { unitPrice: e.target.value })} required /></td>
                  <td className="p-1">
                    <select className="input" value={r.tvaRateId} onChange={(e) => update(r.key, { tvaRateId: e.target.value })}>
                      {tvaRates.map((t) => <option key={t.id} value={t.id}>{formatPercent(t.rate)}</option>)}
                    </select>
                  </td>
                  <td className="p-1"><button type="button" className="btn btn-ghost !px-2" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Supprimer le poste">×</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="p-3" colSpan={6} style={{ color: "var(--muted)" }}>Aucun poste.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="text-sm text-right space-y-0.5">
          <p>Marché HT : <strong>{totals ? `${formatAmount(totals.ht)} DT` : "—"}</strong></p>
          <p style={{ color: "var(--muted)" }}>TVA {totals ? `${formatAmount(totals.tva)} DT` : "—"} · TTC {totals ? `${formatAmount(totals.ttc)} DT` : "—"}</p>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>Le bordereau est verrouillé dès la première situation facturée.</p>
      </section>
      <button className="btn" disabled={rows.length === 0 || !customerId}>{submitLabel}</button>
    </form>
  );
}
