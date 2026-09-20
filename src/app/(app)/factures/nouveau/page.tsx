import { requirePermission } from "@/lib/auth/session";
import { Flash, PageHeader } from "@/components/ui";
import { saveInvoiceAction } from "../actions";
import { loadEditorData } from "../editor-data";
import { InvoiceEditor } from "../invoice-editor";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; client?: string }>;
}) {
  await requirePermission("invoices:write");
  const { error, client } = await searchParams;
  const data = await loadEditorData();
  const today = new Date().toISOString().slice(0, 10);
  const tva19 = data.tvaRates.find((t) => t.code === "TVA19") ?? data.tvaRates[0];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Nouvelle facture" />
      <Flash error={error} />
      <InvoiceEditor
        action={saveInvoiceAction}
        kind="invoice"
        customers={data.customers}
        products={data.products}
        tvaRates={data.tvaRates}
        paymentTerms={data.paymentTerms}
        fodecRate={data.fodecRate}
        company={data.company}
        initial={{
          customerId: data.customers.some((c) => c.id === client) ? (client ?? "") : "",
          issueDate: today, dueDate: "", paymentTermId: "", reference: "", notes: "",
          lines: [{
            productId: "", description: "", quantity: "1", unit: "unité", unitPrice: "0",
            discountPercent: "0", tvaRateId: tva19?.id ?? "", fodecApplicable: false,
          }],
        }}
      />
    </div>
  );
}
