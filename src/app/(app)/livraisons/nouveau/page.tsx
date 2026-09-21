import { requirePermission } from "@/lib/auth/session";
import { todayTunis } from "@/lib/dates";
import { Flash, PageHeader } from "@/components/ui";
import { saveDeliveryAction } from "../actions";
import { DeliveryEditor } from "../delivery-editor";
import { loadDeliveryEditorData } from "../editor-data";

export const dynamic = "force-dynamic";

export default async function NewDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission("delivery:write");
  const { error } = await searchParams;
  const data = await loadDeliveryEditorData();
  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader title="Nouveau bon de livraison" />
      <Flash error={error} />
      <DeliveryEditor
        action={saveDeliveryAction} customers={data.customers} products={data.products}
        initial={{ customerId: "", issueDate: todayTunis(), reference: "", notes: "", lines: [{ productId: "", quantity: "1", description: "", unitPrice: "" }] }}
      />
    </div>
  );
}
