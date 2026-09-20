import { db } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { listPaymentTerms } from "@/lib/payment-terms";
import { listTaxRates } from "@/lib/taxes";
import { Flash, PageHeader } from "@/components/ui";
import { createCustomerAction } from "../actions";
import { CustomerForm } from "../customer-form";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission("customers:write");
  const { error } = await searchParams;
  const [terms, withholdingRates] = await Promise.all([
    listPaymentTerms(db, { activeOnly: true }),
    listTaxRates(db, { kind: "retenue", activeOnly: true }),
  ]);
  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title="Nouveau client" />
      <Flash error={error} />
      <CustomerForm action={createCustomerAction} terms={terms} withholdingRates={withholdingRates} canWrite submitLabel="Créer le client" />
    </div>
  );
}
