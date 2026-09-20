import { db } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { listTaxRates } from "@/lib/taxes";
import { Flash, PageHeader } from "@/components/ui";
import { createProductAction } from "../actions";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission("products:write");
  const { error } = await searchParams;
  const tvaRates = await listTaxRates(db, { kind: "tva", activeOnly: true });
  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title="Nouvel article" />
      <Flash error={error} />
      <ProductForm action={createProductAction} tvaRates={tvaRates} canWrite submitLabel="Créer l'article" />
    </div>
  );
}
