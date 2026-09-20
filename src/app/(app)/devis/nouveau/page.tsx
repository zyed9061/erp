import { requirePermission } from "@/lib/auth/session";
import { todayTunis } from "@/lib/dates";
import { Flash, PageHeader } from "@/components/ui";
import { loadEditorData } from "../../factures/editor-data";
import { InvoiceEditor } from "../../factures/invoice-editor";
import { saveQuoteAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission("quotes:write");
  const { error } = await searchParams;
  const data = await loadEditorData();
  const tva19 = data.tvaRates.find((t) => t.code === "TVA19") ?? data.tvaRates[0];

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Nouveau devis" />
      <Flash error={error} />
      <InvoiceEditor
        action={saveQuoteAction}
        kind="quote"
        customers={data.customers}
        products={data.products}
        tvaRates={data.tvaRates}
        paymentTerms={data.paymentTerms}
        fodecRate={data.fodecRate}
        company={data.company}
        initial={{
          customerId: "", issueDate: todayTunis(), dueDate: "", paymentTermId: "", reference: "", notes: "",
          lines: [{
            productId: "", description: "", quantity: "1", unit: "unité", unitPrice: "0",
            discountPercent: "0", tvaRateId: tva19?.id ?? "", fodecApplicable: false,
          }],
        }}
      />
    </div>
  );
}
