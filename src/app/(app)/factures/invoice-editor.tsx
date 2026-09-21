"use client";

import { useMemo, useState } from "react";
import { calculateInvoice } from "@/lib/invoicing/calc";
import { formatAmount, formatPercent, parseAmount, parseSignedAmount } from "@/lib/money";

export type EditorCustomer = {
  id: string; code: string; name: string; taxStatus: string;
  stampExempt: boolean; withholdingRate: string | null; paymentTermId: string | null;
};
export type EditorProduct = {
  id: string; code: string; name: string; unit: string; unitPrice: string; tvaRateId: string; fodecApplicable: boolean;
};
export type EditorRate = { id: string; code: string; label: string; rate: string };
export type EditorLine = {
  productId: string; description: string; quantity: string; unit: string; unitPrice: string;
  discountPercent: string; tvaRateId: string; fodecApplicable: boolean;
};
export type EditorInitial = {
  customerId: string; issueDate: string; dueDate: string; paymentTermId: string;
  reference: string; notes: string; lines: EditorLine[];
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  kind: "invoice" | "credit_note" | "deposit_invoice" | "quote";
  invoiceId?: string;
  version?: number;
  customers: EditorCustomer[];
  products: EditorProduct[];
  tvaRates: EditorRate[];
  paymentTerms: { id: string; label: string }[];
  fodecRate: string | null;
  company: {
    vatRegistered: boolean; stampDutyEnabled: boolean; stampDutyAmount: string;
    withholdingBase: "ht" | "ttc"; withholdingThreshold: string;
  };
  /** Avoir : taux de retenue hérité de la facture d'origine. */
  creditWithholdingRate?: string | null;
  /** Retenue de garantie (chantier) : conservée pour l'aperçu des totaux. */
  guaranteeHoldbackRate?: string | null;
  initial: EditorInitial;
};

type Row = EditorLine & { key: string };
const newKey = () => Math.random().toString(36).slice(2);

export function InvoiceEditor(props: Props) {
  const { kind, customers, products, tvaRates, company, fodecRate } = props;
  const [customerId, setCustomerId] = useState(props.initial.customerId);
  const [issueDate, setIssueDate] = useState(props.initial.issueDate);
  const [dueDate, setDueDate] = useState(props.initial.dueDate);
  const [paymentTermId, setPaymentTermId] = useState(props.initial.paymentTermId);
  const [reference, setReference] = useState(props.initial.reference);
  const [notes, setNotes] = useState(props.initial.notes);
  const [rows, setRows] = useState<Row[]>(props.initial.lines.map((l) => ({ ...l, key: newKey() })));

  const customer = customers.find((c) => c.id === customerId);
  const vatExempt = !company.vatRegistered || customer?.taxStatus === "exonere" || customer?.taxStatus === "export";

  const calc = useMemo(() => {
    try {
      if (rows.length === 0) return null;
      const lines = rows.map((r) => ({
        quantity: parseAmount(r.quantity),
        unitPrice: parseSignedAmount(r.unitPrice), // négatif autorisé (déduction d'acompte)
        discountPercent: parseAmount(r.discountPercent || "0"),
        tvaRate: vatExempt ? "0.000" : (tvaRates.find((t) => t.id === r.tvaRateId)?.rate ?? "0.000"),
        fodecRate: r.fodecApplicable && fodecRate ? fodecRate : "0.000",
      }));
      return calculateInvoice(lines, {
        stampDuty: kind === "invoice" && company.stampDutyEnabled && customer && !customer.stampExempt ? company.stampDutyAmount : "0.000",
        withholdingRate: kind === "quote" ? null : kind === "credit_note" ? (props.creditWithholdingRate ?? null) : (customer?.withholdingRate ?? null),
        withholdingBase: company.withholdingBase,
        withholdingThreshold: company.withholdingThreshold,
        guaranteeHoldbackRate: props.guaranteeHoldbackRate ?? null,
      });
    } catch {
      return null; // saisie incomplète ou invalide : pas d'aperçu
    }
  }, [rows, vatExempt, tvaRates, fodecRate, kind, company, customer, props.creditWithholdingRate, props.guaranteeHoldbackRate]);

  const update = (key: string, patch: Partial<EditorLine>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addBlank = () =>
    setRows((rs) => [...rs, {
      key: newKey(), productId: "", description: "", quantity: "1", unit: "unité", unitPrice: "0",
      discountPercent: "0", tvaRateId: tvaRates.find((t) => t.code === "TVA19")?.id ?? tvaRates[0]?.id ?? "",
      fodecApplicable: false,
    }]);

  const addProduct = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setRows((rs) => [...rs, {
      key: newKey(), productId: p.id, description: p.name, quantity: "1", unit: p.unit,
      unitPrice: p.unitPrice, discountPercent: "0", tvaRateId: p.tvaRateId, fodecApplicable: p.fodecApplicable,
    }]);
  };

  const payload = JSON.stringify({
    customerId, issueDate, dueDate, paymentTermId, reference, notes,
    lines: rows.map(({ key: _k, ...l }) => l),
  });

  return (
    <form action={props.action} className="space-y-4">
      {props.invoiceId && <input type="hidden" name="id" value={props.invoiceId} />}
      {props.version !== undefined && <input type="hidden" name="version" value={props.version} />}
      <input type="hidden" name="payload" value={payload} />

      <section className="card p-4 grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Client *</span>
          <select className="input" value={customerId} onChange={(e) => {
            setCustomerId(e.target.value);
            const c = customers.find((x) => x.id === e.target.value);
            if (c?.paymentTermId) setPaymentTermId(c.paymentTermId);
            setDueDate("");
          }} disabled={kind === "credit_note"} required>
            <option value="">— Choisir —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Date d&apos;émission *</span>
          <input className="input" type="date" value={issueDate} onChange={(e) => { setIssueDate(e.target.value); setDueDate(""); }} required />
        </label>
        {kind === "quote" && (
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-sm">Valable jusqu&apos;au</span>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        )}
        {kind !== "credit_note" && kind !== "quote" && (
          <>
            <label className="block space-y-1">
              <span className="text-sm">Condition de paiement</span>
              <select className="input" value={paymentTermId} onChange={(e) => { setPaymentTermId(e.target.value); setDueDate(""); }}>
                <option value="">Par défaut du client</option>
                {props.paymentTerms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Échéance</span>
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <span className="block text-xs" style={{ color: "var(--muted)" }}>Vide : calculée depuis la condition de paiement</span>
            </label>
          </>
        )}
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm">Référence (bon de commande, contrat…)</span>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
        </label>
        {vatExempt && customer && (
          <p className="sm:col-span-2 text-sm" style={{ color: "var(--muted)" }}>
            TVA à 0 % sur toutes les lignes ({company.vatRegistered ? "client exonéré ou export" : "société non assujettie"}).
          </p>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <h2 className="font-medium">Lignes</h2>
          <div className="flex gap-2 flex-wrap">
            <select className="input !w-64" value="" onChange={(e) => { addProduct(e.target.value); e.target.value = ""; }}>
              <option value="">+ Ajouter un article…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
            <button type="button" className="btn btn-ghost" onClick={addBlank}>+ Ligne libre</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left" style={{ color: "var(--muted)" }}>
                <th className="p-1">Désignation</th><th className="p-1 w-20">Qté</th><th className="p-1 w-20">Unité</th>
                <th className="p-1 w-28">Prix HT</th><th className="p-1 w-20">Remise %</th><th className="p-1 w-32">TVA</th>
                <th className="p-1 w-16">FODEC</th><th className="p-1 w-28 text-right">Total HT</th><th className="p-1 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} className="align-top">
                  <td className="p-1"><input className="input" value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} maxLength={500} required /></td>
                  <td className="p-1"><input className="input" inputMode="decimal" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} /></td>
                  <td className="p-1"><input className="input" value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} maxLength={30} /></td>
                  <td className="p-1"><input className="input" inputMode="decimal" value={r.unitPrice} onChange={(e) => update(r.key, { unitPrice: e.target.value })} /></td>
                  <td className="p-1"><input className="input" inputMode="decimal" value={r.discountPercent} onChange={(e) => update(r.key, { discountPercent: e.target.value })} /></td>
                  <td className="p-1">
                    <select className="input" value={r.tvaRateId} onChange={(e) => update(r.key, { tvaRateId: e.target.value })} disabled={vatExempt}>
                      {tvaRates.map((t) => <option key={t.id} value={t.id}>{formatPercent(t.rate)}</option>)}
                    </select>
                  </td>
                  <td className="p-1 text-center pt-3">
                    <input type="checkbox" checked={r.fodecApplicable} onChange={(e) => update(r.key, { fodecApplicable: e.target.checked })} disabled={!fodecRate} aria-label="Soumis au FODEC" />
                  </td>
                  <td className="p-1 text-right pt-3 whitespace-nowrap">{calc ? formatAmount(calc.lines[i]?.netHt ?? "0") : "—"}</td>
                  <td className="p-1"><button type="button" className="btn btn-ghost !px-2" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Supprimer la ligne">×</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="p-3" colSpan={9} style={{ color: "var(--muted)" }}>Aucune ligne : ajoutez un article ou une ligne libre.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="card p-4 block space-y-1">
          <span className="text-sm">Notes / mentions</span>
          <textarea className="input" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </label>
        <Totals calc={calc} />
      </section>

      <div className="flex gap-2 items-center">
        <button className="btn" disabled={rows.length === 0 || !customerId}>Enregistrer le brouillon</button>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Aperçu indicatif : les montants définitifs sont calculés à l&apos;enregistrement.
        </span>
      </div>
    </form>
  );
}

function Totals({ calc }: { calc: ReturnType<typeof calculateInvoice> | null }) {
  const t = calc?.totals;
  const row = (label: string, value: string | undefined, strong = false) => (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold border-t pt-2" : ""}`} style={strong ? { borderColor: "var(--border)" } : undefined}>
      <span>{label}</span><span className="whitespace-nowrap">{value === undefined ? "—" : `${formatAmount(value)} DT`}</span>
    </div>
  );
  return (
    <div className="card p-4 space-y-1 text-sm">
      {row("Total brut", t?.gross)}
      {t && t.discount !== "0.000" && row("Remises", t.discount)}
      {row("Total HT", t?.ht)}
      {t && t.fodec !== "0.000" && row("FODEC", t.fodec)}
      {calc?.taxes.filter((x) => x.kind === "tva").map((x) => (
        <div key={x.rate} className="flex justify-between gap-4" style={{ color: "var(--muted)" }}>
          <span>TVA {formatPercent(x.rate)} sur {formatAmount(x.base)}</span><span>{formatAmount(x.amount)} DT</span>
        </div>
      ))}
      {row("Total TTC", t?.ttc, true)}
      {t && t.stampDuty !== "0.000" && row("Timbre fiscal", t.stampDuty)}
      {t && t.withholdingAmount !== "0.000" && row(`Retenue à la source (${formatPercent(t.withholdingRate ?? "0")})`, `-${t.withholdingAmount}`)}
      {t && t.guaranteeHoldback !== "0.000" && row(`Retenue de garantie (${formatPercent(t.guaranteeHoldbackRate ?? "0")})`, `-${t.guaranteeHoldback}`)}
      {row("Net à payer", t?.netToPay, true)}
    </div>
  );
}
