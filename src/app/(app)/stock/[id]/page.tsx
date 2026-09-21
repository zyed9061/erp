import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { todayTunis } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { getProduct } from "@/lib/products";
import { listMovements, stockOnHand } from "@/lib/stock";
import { Field, Flash } from "@/components/ui";
import { addMovementAction } from "../actions";

export const dynamic = "force-dynamic";

const TYPE_LABELS = { entry: "Entrée", exit: "Sortie", adjustment: "Ajustement", delivery: "Livraison" } as const;

export default async function StockProductPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission("stock:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const product = await getProduct(db, id);
  if (!product || !product.trackStock) notFound();
  const { ok, error } = await searchParams;
  const [onHand, movements] = await Promise.all([stockOnHand(db, id), listMovements(db, id)]);
  const canWrite = can(user.role, "stock:write");

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">{product.name} <span className="font-mono text-sm" style={{ color: "var(--muted)" }}>{product.code}</span></h1>
      <Flash ok={ok} error={error} />
      <div className="card p-4 flex flex-wrap gap-6 items-baseline">
        <p className="text-3xl font-semibold">{formatAmount(onHand)} <span className="text-base font-normal">{product.unit}</span></p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>Seuil d&apos;alerte : {Number(product.minStock) > 0 ? formatAmount(product.minStock) : "aucun"}</p>
        <Link className="underline text-sm" href={`/produits/${product.id}`}>Fiche article</Link>
      </div>

      {canWrite && (
        <form action={addMovementAction} className="card p-4 grid gap-3 sm:grid-cols-4 items-end">
          <input type="hidden" name="productId" value={product.id} />
          <Field label="Type">
            <select className="input" name="type" defaultValue="entry">
              <option value="entry">Entrée (réception)</option>
              <option value="exit">Sortie (casse, usage interne)</option>
              <option value="adjustment">Ajustement d&apos;inventaire (±)</option>
            </select>
          </Field>
          <Field label="Quantité" hint="Positive ; négative seulement pour un ajustement">
            <input className="input" name="quantity" inputMode="decimal" required />
          </Field>
          <Field label="Date"><input className="input" type="date" name="occurredOn" defaultValue={todayTunis()} /></Field>
          <Field label="Référence"><input className="input" name="reference" maxLength={100} placeholder="N° de réception…" /></Field>
          <Field label="Motif / notes" className="sm:col-span-3"><input className="input" name="notes" maxLength={500} placeholder="Obligatoire pour un ajustement" /></Field>
          <button className="btn">Enregistrer</button>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3 text-right">Quantité</th>
              <th className="p-3">Référence</th><th className="p-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 whitespace-nowrap">{m.occurredOn}</td>
                <td className="p-3">{TYPE_LABELS[m.type]}</td>
                <td className="p-3 text-right whitespace-nowrap" style={Number(m.quantity) < 0 ? { color: "var(--danger)" } : undefined}>
                  {Number(m.quantity) > 0 ? "+" : ""}{formatAmount(m.quantity)}
                </td>
                <td className="p-3">{m.deliveryNoteId ? <Link className="underline" href={`/livraisons/${m.deliveryNoteId}`}>{m.reference}</Link> : (m.reference ?? "—")}</td>
                <td className="p-3">{m.notes ?? "—"}</td>
              </tr>
            ))}
            {movements.length === 0 && <tr><td className="p-3" colSpan={5} style={{ color: "var(--muted)" }}>Aucun mouvement.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>Le registre est en ajout seul : une erreur se corrige par un ajustement daté et motivé.</p>
    </div>
  );
}
