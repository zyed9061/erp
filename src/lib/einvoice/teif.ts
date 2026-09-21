import type { InvoiceKind } from "@/db/schema";
import { TEIF_VERSION, PENDING_CODE, codeOf, unitCode, type TeifCodeKey } from "./teif-codes";
import { el, render, type XmlNode } from "./xml";

/** Données d'une facture validée, indépendantes de tout format de sortie (instantanés figés à la validation). */
export type EinvoiceParty = {
  name: string; matriculeFiscal: string | null; address: string | null; city: string | null; postalCode: string | null; country: string;
};

export type EinvoiceData = {
  kind: InvoiceKind;
  number: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string | null;
  currency: string;
  reference: string | null;
  notes: string | null;
  originalNumber: string | null;
  company: EinvoiceParty;
  customer: EinvoiceParty & { type: string };
  lines: {
    position: number; description: string; quantity: string; unit: string; unitPrice: string; discountPercent: string;
    tvaCode: string; tvaRate: string; fodecRate: string; netHt: string; fodec: string;
  }[];
  taxes: { kind: "tva" | "fodec"; rate: string; base: string; amount: string }[];
  totals: {
    ht: string; fodec: string; tvaBase: string; tva: string; ttc: string; stampDuty: string;
    withholdingRate: string | null; withholdingAmount: string; netToPay: string;
  };
};

const ddMMyy = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}`;

/** "19.000" -> "19", "1.500" -> "1.5" : le taux reste lisible sans zéros inutiles. */
const rate = (r: string) => (r.includes(".") ? r.replace(/\.?0+$/, "") : r) || "0";

const moa = (data: EinvoiceData, type: TeifCodeKey, amount: string) =>
  el("Moa", { amountTypeCode: codeOf(type), currencyCodeList: "ISO_4217" }, el("Amount", { currencyIdentifier: data.currency }, amount));

const amountBlock = (data: EinvoiceData, type: TeifCodeKey, amount: string) =>
  el("AmountDescription", { lang: "fr", amountTypeCode: codeOf(type) }, moa(data, type, amount));

function party(functionKey: TeifCodeKey, p: EinvoiceParty): XmlNode {
  return el("PartnerDetails", { functionCode: codeOf(functionKey) },
    el("Nad",
      {},
      p.matriculeFiscal && el("PartnerIdentifier", { type: codeOf("idTaxNumber") }, p.matriculeFiscal),
      el("PartnerName", { nameType: "Qualification" }, p.name),
      el("PartnerAdresses", { lang: "fr" },
        el("AdressDescription", {}, p.address ?? ""),
        p.city && el("CityName", {}, p.city),
        p.postalCode && el("PostalCode", {}, p.postalCode),
        el("Country", { codeList: "ISO_3166-1" }, p.country),
      ),
    ),
  );
}

const docType = (kind: InvoiceKind): TeifCodeKey => (kind === "credit_note" ? "docCreditNote" : kind === "deposit_invoice" ? "docDeposit" : "docInvoice");

const TYPE_LABELS: Record<InvoiceKind, string> = { invoice: "Facture", credit_note: "Facture d'avoir", deposit_invoice: "Facture d'acompte" };

/**
 * Construit un fichier TEIF NON SIGNÉ. Voir `teif-codes.ts` : la structure suit la spécification telle qu'elle est connue,
 * mais elle n'a pas été validée contre le XSD officiel. Le résultat est déterministe (aucune date de génération).
 */
export function buildTeifXml(data: EinvoiceData): string {
  const dates = [
    el("DateText", { format: "ddMMyy", functionCode: codeOf("dateIssue") }, ddMMyy(data.issueDate)),
    data.dueDate && el("DateText", { format: "ddMMyy", functionCode: codeOf("dateDue") }, ddMMyy(data.dueDate)),
  ];

  const lines = data.lines.map((l) => el("Lin", {},
    el("ItemIdentifier", {}, String(l.position)),
    el("LinImd", { lang: "fr" }, el("ImdDescription", {}, l.description)),
    el("LinQty", {}, el("Quantity", { measurementUnit: unitCode(l.unit) }, l.quantity)),
    el("LinPrice", {}, el("PriceDetails", {}, el("Price", { currencyIdentifier: data.currency }, l.unitPrice))),
    Number(l.discountPercent) > 0 && el("LinAlc", {}, el("AllowanceRate", {}, rate(l.discountPercent))),
    el("LinTax", {},
      el("TaxTypeName", { code: codeOf("taxVat") }, "TVA"),
      el("TaxDetails", {}, el("TaxRate", {}, l.tvaCode === "EXO" ? "0" : rate(l.tvaRate))),
    ),
    Number(l.fodecRate) > 0 && el("LinTax", {},
      el("TaxTypeName", { code: codeOf("taxFodec") }, "FODEC"),
      el("TaxDetails", {}, el("TaxRate", {}, rate(l.fodecRate))),
    ),
    el("LinMoa", {}, el("MoaDetails", {}, moa(data, "amountLineNet", l.netHt))),
  ));

  const taxDetails = data.taxes
    .slice().sort((a, b) => a.kind.localeCompare(b.kind) || Number(a.rate) - Number(b.rate))
    .map((t) => el("InvoiceTaxDetails", {},
      el("Tax", {}, el("TaxTypeName", { code: codeOf(t.kind === "tva" ? "taxVat" : "taxFodec") }, t.kind === "tva" ? "TVA" : "FODEC"),
        el("TaxDetails", {}, el("TaxRate", {}, rate(t.rate)))),
      el("AmountDetails", {}, moa(data, "amountTaxableBase", t.base), moa(data, "amountTaxLine", t.amount)),
    ));
  if (Number(data.totals.stampDuty) > 0) {
    taxDetails.push(el("InvoiceTaxDetails", {},
      el("Tax", {}, el("TaxTypeName", { code: codeOf("taxStamp") }, "Droit de timbre")),
      el("AmountDetails", {}, moa(data, "amountStamp", data.totals.stampDuty)),
    ));
  }
  if (Number(data.totals.withholdingAmount) > 0) {
    taxDetails.push(el("InvoiceTaxDetails", {},
      el("Tax", {}, el("TaxTypeName", { code: codeOf("taxWithholding") }, "Retenue à la source"),
        data.totals.withholdingRate && el("TaxDetails", {}, el("TaxRate", {}, rate(data.totals.withholdingRate)))),
      el("AmountDetails", {}, moa(data, "amountWithholding", data.totals.withholdingAmount)),
    ));
  }

  const t = data.totals;
  const root = el("TEIF", { version: TEIF_VERSION, controlingAgency: "TTN" },
    el("InvoiceHeader", {},
      data.company.matriculeFiscal && el("MessageSenderIdentifier", { type: codeOf("idTaxNumber") }, data.company.matriculeFiscal),
      data.customer.matriculeFiscal && el("MessageRecieverIdentifier", { type: codeOf("idTaxNumber") }, data.customer.matriculeFiscal),
    ),
    el("InvoiceBody", {},
      el("Bgm", {}, el("DocumentIdentifier", {}, data.number), el("DocumentType", { code: codeOf(docType(data.kind)) }, TYPE_LABELS[data.kind])),
      el("Dtm", {}, ...dates),
      el("PartnerSection", {}, party("partySupplier", data.company), party("partyBuyer", data.customer)),
      (data.originalNumber || data.reference) && el("RffSection", {},
        data.originalNumber && el("Rff", {}, el("RefIdentifier", { refID: codeOf("refOriginalInvoice") }, data.originalNumber)),
        data.reference && el("Rff", {}, el("RefIdentifier", { refID: PENDING_CODE }, data.reference)),
      ),
      el("LinSection", {}, ...lines),
      el("InvoiceMoa", {},
        amountBlock(data, "amountTotalHt", t.ht),
        Number(t.fodec) > 0 && amountBlock(data, "amountFodec", t.fodec),
        amountBlock(data, "amountTaxBase", t.tvaBase),
        amountBlock(data, "amountTotalVat", t.tva),
        amountBlock(data, "amountTotalTtc", t.ttc),
        amountBlock(data, "amountNetToPay", t.netToPay),
      ),
      el("InvoiceTax", {}, ...taxDetails),
      data.notes && el("FreeText", { lang: "fr" }, data.notes),
    ),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- PRÉPARATION TEIF : fichier non signé et non validé contre le XSD officiel de TTN. Ne pas transmettre en l'état. -->`,
    render(root),
    "",
  ].join("\n");
}
