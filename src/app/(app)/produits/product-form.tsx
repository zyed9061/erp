import { PRODUCT_TYPES, type Product, type TaxRate } from "@/db/schema";
import { Field } from "@/components/ui";
import { formatPercent } from "@/lib/money";

export function ProductForm({
  action, product, tvaRates, canWrite, submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  product?: Product;
  tvaRates: TaxRate[];
  canWrite: boolean;
  submitLabel: string;
}) {
  return (
    <form action={action} className="card p-4">
      <fieldset disabled={!canWrite} className="grid gap-3 sm:grid-cols-2">
        {product && <input type="hidden" name="id" value={product.id} />}
        <Field label="Désignation *" className="sm:col-span-2">
          <input className="input" name="name" defaultValue={product?.name} required maxLength={200} />
        </Field>
        {!product && (
          <Field label="Code article" hint="Laissez vide pour une attribution automatique (ART-00001…)">
            <input className="input" name="code" maxLength={30} />
          </Field>
        )}
        <Field label="Type">
          <select className="input" name="type" defaultValue={product?.type ?? "service"}>
            {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t === "bien" ? "Bien (marchandise)" : "Service"}</option>)}
          </select>
        </Field>
        <Field label="Unité">
          <input className="input" name="unit" defaultValue={product?.unit ?? "unité"} required maxLength={30} />
        </Field>
        <Field label="Prix unitaire HT (DT)" hint="3 décimales maximum">
          <input className="input" name="unitPrice" inputMode="decimal" defaultValue={product?.unitPrice ?? "0.000"} required />
        </Field>
        <Field label="Taux de TVA">
          <select className="input" name="tvaRateId" defaultValue={product?.tvaRateId ?? tvaRates.find((r) => r.code === "TVA19")?.id} required>
            {tvaRates.map((r) => <option key={r.id} value={r.id}>{r.label} ({formatPercent(r.rate)})</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm self-end pb-2">
          <input type="checkbox" name="fodecApplicable" defaultChecked={product?.fodecApplicable} /> Soumis au FODEC
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="trackStock" defaultChecked={product?.trackStock} /> Suivre le stock (biens uniquement)
        </label>
        <Field label="Seuil d'alerte de stock" hint="Alerte quand le stock passe sous ce seuil (0 = pas d'alerte)">
          <input className="input" name="minStock" inputMode="decimal" defaultValue={product?.minStock ?? "0.000"} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea className="input" name="description" rows={3} defaultValue={product?.description ?? ""} maxLength={2000} />
        </Field>
        {canWrite && <div className="sm:col-span-2"><button className="btn">{submitLabel}</button></div>}
      </fieldset>
    </form>
  );
}
