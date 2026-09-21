import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { getProduct } from "@/lib/products";
import { listTaxRates } from "@/lib/taxes";
import { Flash, PageHeader, StatusBadge } from "@/components/ui";
import { toggleProductAction, updateProductAction } from "../actions";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission("products:read");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const product = await getProduct(db, id);
  if (!product) notFound();
  const { ok, error } = await searchParams;
  const canWrite = can(user.role, "products:write");

  // Les taux actifs, plus le taux courant de l'article s'il a été désactivé depuis.
  const all = await listTaxRates(db, { kind: "tva" });
  const tvaRates = all.filter((r) => r.isActive || r.id === product.tvaRateId);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap">
        <PageHeader title={product.name} />
        <span className="font-mono text-sm" style={{ color: "var(--muted)" }}>{product.code}</span>
        <StatusBadge active={product.isActive} />
      </div>
      <Flash ok={ok} error={error} />
      {product.trackStock && (
        <p className="text-sm"><a className="underline" href={`/stock/${product.id}`}>Voir le stock et les mouvements</a></p>
      )}
      <ProductForm action={updateProductAction} product={product} tvaRates={tvaRates} canWrite={canWrite} submitLabel="Enregistrer" />
      {canWrite && (
        <form action={toggleProductAction}>
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="isActive" value={String(!product.isActive)} />
          <button className="btn btn-ghost" style={product.isActive ? { color: "var(--danger)" } : undefined}>
            {product.isActive ? "Désactiver cet article" : "Réactiver cet article"}
          </button>
        </form>
      )}
    </div>
  );
}
