import { ScanText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getT } from "@/i18n/server";
import { OCR_ALLOWED_TYPES, OCR_MAX_UPLOAD_MB } from "@/lib/ocr";
import { InvoiceTabs } from "../InvoiceTabs";
import { InvoiceExtractor } from "./InvoiceExtractor";

export default async function ExtractInvoicePage() {
  const t = await getT();

  return (
    <div>
      <PageHeader title={t("invoices.extractTitle")} />
      <InvoiceTabs />
      {process.env.OCR_APP_URL ? (
        <InvoiceExtractor
          maxUploadMb={OCR_MAX_UPLOAD_MB}
          allowedTypes={OCR_ALLOWED_TYPES}
          description={t("invoices.extractDescription")}
        />
      ) : (
        <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <ScanText className="h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="max-w-md text-sm text-slate-500">{t("invoices.extractUnavailable")}</p>
        </div>
      )}
    </div>
  );
}
