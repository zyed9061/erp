import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Db } from "@/db/types";
import { getCompany } from "../company";
import { getDeliveryNote } from "../delivery";
import { formatAmount } from "../money";
import type { PdfData } from "./render";

export type DeliveryPdfData = {
  number: string | null;
  status: "draft" | "validated" | "cancelled";
  issueDate: string;
  reference: string | null;
  company: PdfData["company"];
  customer: PdfData["customer"];
  lines: { description: string; quantity: string; unit: string }[];
  notes: string | null;
};

const A4 = { w: 595.28, h: 841.89 };
const M = 40;
const INK = rgb(0.07, 0.09, 0.17);
const MUTED = rgb(0.4, 0.42, 0.5);
const LINE = rgb(0.86, 0.87, 0.91);
const BRAND = rgb(0.31, 0.27, 0.9);
const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "long", timeZone: "UTC" });

/** Bon de livraison : quantités seulement (pas de prix), avec zone de signature « Reçu par ». */
export async function renderDeliveryNotePdf(data: DeliveryPdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Bon de livraison ${data.number ?? "(brouillon)"}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(font.getCharacterSet());
  const clean = (s: string) =>
    Array.from(s.replace(/[  ]/g, " ").replace(/[\r\n\t]+/g, " ")).map((c) => (supported.has(c.codePointAt(0)!) ? c : "?")).join("");

  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const text = (s: string, x: number, size = 9, f: PDFFont = font, color = INK) =>
    page.drawText(clean(s), { x, y, size, font: f, color });
  const right = (s: string, xRight: number, size = 9, f: PDFFont = font, color = INK) => {
    const c = clean(s);
    page.drawText(c, { x: xRight - f.widthOfTextAtSize(c, size), y, size, font: f, color });
  };
  const wrap = (s: string, maxWidth: number, size: number, f: PDFFont = font) => {
    const out: string[] = [];
    let line = "";
    for (const word of clean(s).split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) <= maxWidth || !line) line = test;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };

  const c = data.company;
  const top = y;
  text(c.legalName, M, 14, bold); y -= 15;
  for (const l of [
    [c.address, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    [c.phone ? `Tél. ${c.phone}` : null, c.email].filter(Boolean).join(" · "),
    c.matriculeFiscal ? `MF : ${c.matriculeFiscal}` : "",
  ].filter(Boolean)) { text(l, M, 9, font, MUTED); y -= 12; }
  const leftBottom = y;

  y = top;
  right("BON DE LIVRAISON", A4.w - M, 18, bold, BRAND); y -= 18;
  right(data.number ? `N° ${data.number}` : "N° (brouillon)", A4.w - M, 11, bold); y -= 14;
  right(`Date : ${dateFmt.format(new Date(`${data.issueDate}T00:00:00Z`))}`, A4.w - M, 9, font, MUTED); y -= 12;
  if (data.reference) { right(`Réf. : ${data.reference}`, A4.w - M, 9, font, MUTED); y -= 12; }
  y = Math.min(y, leftBottom) - 14;

  const boxTop = y;
  const cust = data.customer;
  const custLines = [cust.address ?? "", [cust.postalCode, cust.city].filter(Boolean).join(" ")].filter(Boolean);
  const boxH = 30 + custLines.length * 12;
  page.drawRectangle({ x: A4.w / 2, y: boxTop - boxH, width: A4.w / 2 - M, height: boxH, color: rgb(0.97, 0.97, 0.99), borderColor: LINE, borderWidth: 0.6 });
  y = boxTop - 14;
  page.drawText("LIVRÉ À", { x: A4.w / 2 + 10, y, size: 7.5, font: bold, color: MUTED }); y -= 13;
  page.drawText(clean(cust.name), { x: A4.w / 2 + 10, y, size: 10.5, font: bold, color: INK });
  for (const l of custLines) { y -= 12; page.drawText(clean(l), { x: A4.w / 2 + 10, y, size: 9, font, color: MUTED }); }
  y = boxTop - boxH - 22;

  const header = () => {
    page.drawRectangle({ x: M, y: y - 5, width: A4.w - 2 * M, height: 17, color: rgb(0.94, 0.94, 0.98) });
    text("Désignation", M + 4, 8, bold, MUTED);
    right("Quantité", A4.w - M - 90, 8, bold, MUTED);
    text("Unité", A4.w - M - 80, 8, bold, MUTED);
    y -= 20;
  };
  header();
  for (const l of data.lines) {
    const desc = wrap(l.description, A4.w - 2 * M - 190, 9.5);
    const rowH = desc.length * 12 + 6;
    if (y - rowH < 130) { page = pdf.addPage([A4.w, A4.h]); y = A4.h - M; header(); }
    const rowTop = y;
    desc.forEach((d, i) => { y = rowTop - i * 12; text(d, M + 4, 9.5); });
    y = rowTop;
    right(formatAmount(l.quantity), A4.w - M - 90, 9.5, bold);
    text(l.unit, A4.w - M - 80, 9.5, font, MUTED);
    y = rowTop - rowH + 4;
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: A4.w - M, y: y - 2 }, thickness: 0.6, color: LINE });
    y -= 8;
  }

  if (data.notes) {
    y -= 8;
    text("Notes", M, 8, bold, MUTED); y -= 12;
    for (const n of data.notes.split("\n").flatMap((l) => wrap(l, A4.w - 2 * M, 8.5))) { text(n, M, 8.5, font, MUTED); y -= 11; }
  }

  // Zone de signature sur la dernière page.
  const sigY = 90;
  page.drawText("Reçu par (nom, date et signature) :", { x: M, y: sigY + 62, size: 8.5, font: bold, color: MUTED });
  page.drawRectangle({ x: M, y: sigY, width: 250, height: 55, borderColor: LINE, borderWidth: 0.8 });
  page.drawText("Le livreur :", { x: A4.w / 2 + 20, y: sigY + 62, size: 8.5, font: bold, color: MUTED });
  page.drawRectangle({ x: A4.w / 2 + 20, y: sigY, width: A4.w / 2 - M - 20, height: 55, borderColor: LINE, borderWidth: 0.8 });

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 40 }, end: { x: A4.w - M, y: 40 }, thickness: 0.6, color: LINE });
    p.drawText(clean([c.legalName, c.matriculeFiscal ? `MF ${c.matriculeFiscal}` : null].filter(Boolean).join(" · ")), { x: M, y: 28, size: 7.5, font, color: MUTED });
    const label = `Page ${i + 1} / ${pages.length}`;
    p.drawText(label, { x: A4.w - M - font.widthOfTextAtSize(label, 7.5), y: 28, size: 7.5, font, color: MUTED });
    const stamp = data.status === "draft" ? "BROUILLON" : data.status === "cancelled" ? "ANNULÉ" : null;
    if (stamp) {
      p.drawText(clean(stamp), { x: 130, y: 250, size: 96, font: bold, color: rgb(0.85, 0.15, 0.15), opacity: 0.1, rotate: degrees(40) });
    }
  });
  return pdf.save();
}

export async function loadDeliveryNotePdf(db: Db, id: string): Promise<{ data: DeliveryPdfData; filename: string } | null> {
  const details = await getDeliveryNote(db, id);
  if (!details) return null;
  const { note, lines, customer } = details;
  const company = await getCompany(db);
  const data: DeliveryPdfData = {
    number: note.number, status: note.status, issueDate: note.issueDate, reference: note.reference,
    company: {
      legalName: company.legalName, tradeName: company.tradeName, matriculeFiscal: company.matriculeFiscal, legalForm: company.legalForm,
      capital: company.capital, address: company.address, postalCode: company.postalCode, city: company.city,
      phone: company.phone, email: company.email, bankName: company.bankName, rib: company.rib,
    },
    customer: {
      name: customer?.name ?? "", matriculeFiscal: customer?.matriculeFiscal ?? null, address: customer?.address ?? null,
      postalCode: customer?.postalCode ?? null, city: customer?.city ?? null,
    },
    lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, unit: l.unit })),
    notes: note.notes,
  };
  const base = note.number ?? `bl-brouillon-${note.id.slice(0, 8)}`;
  return { data, filename: `${base.replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf` };
}

