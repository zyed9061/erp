import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatAmount, formatPercent } from "../money";
import { amountInWords } from "./words";

/** Données d'un document à imprimer : indépendantes de la base (chargées par loaders.ts). */
export type PdfData = {
  /** « FACTURE », « AVOIR », « FACTURE D'ACOMPTE », « DEVIS »… */
  title: string;
  number: string | null;
  /** Brouillon : filigrane « BROUILLON », pas de valeur légale. */
  isDraft: boolean;
  issueDate: string;
  dueDate: string | null;
  validUntil: string | null;
  reference: string | null;
  /** Avoir : facture d'origine et motif. */
  creditOf: { number: string; reason: string | null } | null;
  company: {
    legalName: string; tradeName: string | null; matriculeFiscal: string | null; legalForm: string | null;
    capital: string | null; address: string | null; postalCode: string | null; city: string | null;
    phone: string | null; email: string | null; bankName: string | null; rib: string | null;
  };
  customer: { name: string; matriculeFiscal: string | null; address: string | null; postalCode: string | null; city: string | null };
  lines: {
    description: string; quantity: string; unit: string; unitPrice: string;
    discountPercent: string; tva: string; netHt: string;
  }[];
  taxes: { kind: "tva" | "fodec"; rate: string; base: string; amount: string }[];
  totals: {
    ht: string; fodec: string; tva: string; ttc: string; stampDuty: string;
    withholdingRate: string | null; withholdingAmount: string; netToPay: string;
  };
  /** Montant à écrire en lettres (net à payer pour une facture, TTC pour un devis). */
  wordsAmount: string;
  wordsIntro: string;
  notes: string | null;
  /** Empreinte du document validé (affichée en pied de page). */
  fingerprint: string | null;
};

const A4 = { w: 595.28, h: 841.89 };
const M = 40; // marge
const FOOTER = 56;
const INK = rgb(0.07, 0.09, 0.17);
const MUTED = rgb(0.4, 0.42, 0.5);
const LINE = rgb(0.86, 0.87, 0.91);
const BRAND = rgb(0.31, 0.27, 0.9);

// Colonnes du tableau (bord droit des colonnes numériques)
const COL = { desc: M, qty: 335, price: 405, disc: 452, tva: 500, total: A4.w - M };

const dateFmt = new Intl.DateTimeFormat("fr-TN", { dateStyle: "long", timeZone: "UTC" });
const fmtDate = (d: string) => dateFmt.format(new Date(`${d}T00:00:00Z`));

export async function renderDocumentPdf(data: PdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${data.title} ${data.number ?? "(brouillon)"}`);
  pdf.setProducer("Facturation");
  pdf.setCreator("Facturation");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Les polices standard ne couvrent que le latin (WinAnsi) : tout autre caractère devient « ? »
  // plutôt que de faire échouer la génération (ex. un nom de client en arabe).
  const supported = new Set(font.getCharacterSet());
  const clean = (s: string) =>
    Array.from(s.replace(/[  ]/g, " ").replace(/[\r\n\t]+/g, " "))
      .map((c) => (supported.has(c.codePointAt(0)!) ? c : "?"))
      .join("");
  const amt = (v: string) => clean(formatAmount(v));

  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;

  const text = (s: string, x: number, size = 9, f: PDFFont = font, color = INK) =>
    page.drawText(clean(s), { x, y, size, font: f, color });
  const right = (s: string, xRight: number, size = 9, f: PDFFont = font, color = INK) => {
    const c = clean(s);
    page.drawText(c, { x: xRight - f.widthOfTextAtSize(c, size), y, size, font: f, color });
  };
  const hr = (yy = y, color = LINE, x1 = M, x2 = A4.w - M) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color });

  const wrap = (s: string, maxWidth: number, size: number, f: PDFFont = font): string[] => {
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

  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h]);
    y = A4.h - M;
  };
  const ensure = (space: number, onNew?: () => void) => {
    if (y - space < FOOTER) { newPage(); onNew?.(); }
  };

  // ---- En-tête : société (gauche), document (droite) --------------------------------------------
  const c = data.company;
  const top = y;
  text(c.legalName, M, 14, bold);
  y -= 15;
  const companyLines = [
    [c.legalForm, c.capital ? `capital ${amt(c.capital)} DT` : null].filter(Boolean).join(" · "),
    [c.address, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    [c.phone ? `Tél. ${c.phone}` : null, c.email].filter(Boolean).join(" · "),
    c.matriculeFiscal ? `MF : ${c.matriculeFiscal}` : "",
  ].filter(Boolean);
  for (const l of companyLines) { text(l, M, 9, font, MUTED); y -= 12; }
  const leftBottom = y;

  y = top;
  right(data.title, A4.w - M, 20, bold, BRAND);
  y -= 18;
  right(data.number ? `N° ${data.number}` : "N° (brouillon)", A4.w - M, 11, bold);
  y -= 14;
  right(`Date : ${fmtDate(data.issueDate)}`, A4.w - M, 9, font, MUTED);
  y -= 12;
  if (data.dueDate) { right(`Échéance : ${fmtDate(data.dueDate)}`, A4.w - M, 9, font, MUTED); y -= 12; }
  if (data.validUntil) { right(`Valable jusqu'au : ${fmtDate(data.validUntil)}`, A4.w - M, 9, font, MUTED); y -= 12; }
  if (data.reference) { right(`Réf. : ${data.reference}`, A4.w - M, 9, font, MUTED); y -= 12; }
  y = Math.min(y, leftBottom) - 14;

  // ---- Client ------------------------------------------------------------------------------------
  const boxTop = y;
  const cust = data.customer;
  const custLines = [
    cust.matriculeFiscal ? `MF : ${cust.matriculeFiscal}` : "",
    cust.address ?? "",
    [cust.postalCode, cust.city].filter(Boolean).join(" "),
  ].filter(Boolean);
  const boxH = 30 + custLines.length * 12;
  page.drawRectangle({ x: A4.w / 2, y: boxTop - boxH, width: A4.w / 2 - M, height: boxH, color: rgb(0.97, 0.97, 0.99), borderColor: LINE, borderWidth: 0.6 });
  y = boxTop - 14;
  page.drawText("CLIENT", { x: A4.w / 2 + 10, y, size: 7.5, font: bold, color: MUTED });
  y -= 13;
  page.drawText(clean(cust.name), { x: A4.w / 2 + 10, y, size: 10.5, font: bold, color: INK });
  for (const l of custLines) { y -= 12; page.drawText(clean(l), { x: A4.w / 2 + 10, y, size: 9, font, color: MUTED }); }
  y = boxTop - boxH - 16;

  if (data.creditOf) {
    text(`Avoir sur la facture N° ${data.creditOf.number}${data.creditOf.reason ? ` — motif : ${data.creditOf.reason}` : ""}`, M, 9, bold);
    y -= 16;
  }

  // ---- Tableau des lignes --------------------------------------------------------------------------
  const tableHeader = () => {
    page.drawRectangle({ x: M, y: y - 5, width: A4.w - 2 * M, height: 17, color: rgb(0.94, 0.94, 0.98) });
    text("Désignation", COL.desc + 4, 8, bold, MUTED);
    right("Qté", COL.qty, 8, bold, MUTED);
    right("P.U. HT", COL.price, 8, bold, MUTED);
    right("Remise", COL.disc, 8, bold, MUTED);
    right("TVA", COL.tva, 8, bold, MUTED);
    right("Total HT", COL.total - 4, 8, bold, MUTED);
    y -= 20;
  };
  tableHeader();
  for (const l of data.lines) {
    const descLines = wrap(l.description, COL.qty - COL.desc - 62, 9);
    const rowH = descLines.length * 11.5 + 5;
    ensure(rowH, tableHeader);
    const rowTop = y;
    descLines.forEach((dl, i) => { y = rowTop - i * 11.5; text(dl, COL.desc + 4, 9); });
    y = rowTop;
    right(`${amt(l.quantity)} ${l.unit}`.trim(), COL.qty, 9);
    right(amt(l.unitPrice), COL.price, 9);
    right(Number(l.discountPercent) > 0 ? formatPercent(l.discountPercent) : "—", COL.disc, 9, font, MUTED);
    right(l.tva, COL.tva, 9, font, MUTED);
    right(amt(l.netHt), COL.total - 4, 9);
    y = rowTop - rowH + 5;
    hr(y - 2);
    y -= 8;
  }

  // ---- Récapitulatif des taxes (gauche) et totaux (droite) -------------------------------------
  const t = data.totals;
  const totalRows: [string, string, boolean][] = [["Total HT", amt(t.ht), false]];
  if (Number(t.fodec) > 0) totalRows.push(["FODEC", amt(t.fodec), false]);
  totalRows.push(["Total TVA", amt(t.tva), false], ["Total TTC", amt(t.ttc), true]);
  if (Number(t.stampDuty) > 0) totalRows.push(["Timbre fiscal", amt(t.stampDuty), false]);
  if (Number(t.withholdingAmount) > 0) {
    totalRows.push([`Retenue à la source (${formatPercent(t.withholdingRate ?? "0")})`, `-${amt(t.withholdingAmount)}`, false]);
  }
  const showNet = Number(t.stampDuty) > 0 || Number(t.withholdingAmount) > 0;
  if (showNet) totalRows.push(["Net à payer", `${amt(t.netToPay)} DT`, true]);
  else totalRows[totalRows.length - 1] = ["Total TTC", `${amt(t.ttc)} DT`, true];

  const blockH = Math.max(totalRows.length * 16, (data.taxes.length + 1) * 13 + 14) + 60;
  ensure(blockH);
  y -= 8;
  const blockTop = y;

  // Taxes
  text("Récapitulatif des taxes", M, 8, bold, MUTED);
  let ty = blockTop - 14;
  page.drawText("Taxe", { x: M, y: ty, size: 8, font: bold, color: MUTED });
  page.drawText("Base", { x: M + 130 - font.widthOfTextAtSize("Base", 8), y: ty, size: 8, font: bold, color: MUTED });
  page.drawText("Montant", { x: M + 210 - font.widthOfTextAtSize("Montant", 8), y: ty, size: 8, font: bold, color: MUTED });
  for (const tx of data.taxes) {
    ty -= 13;
    page.drawText(clean(`${tx.kind === "tva" ? "TVA" : "FODEC"} ${formatPercent(tx.rate)}`), { x: M, y: ty, size: 8.5, font, color: INK });
    const base = amt(tx.base), amount = amt(tx.amount);
    page.drawText(base, { x: M + 130 - font.widthOfTextAtSize(base, 8.5), y: ty, size: 8.5, font, color: INK });
    page.drawText(amount, { x: M + 210 - font.widthOfTextAtSize(amount, 8.5), y: ty, size: 8.5, font, color: INK });
  }

  // Totaux
  let ry = blockTop - 2;
  const labelX = A4.w - M - 235;
  for (const [label, value, strong] of totalRows) {
    ry -= 16;
    if (strong) {
      page.drawRectangle({ x: labelX - 6, y: ry - 5, width: 241, height: 18, color: rgb(0.94, 0.94, 0.98) });
    }
    const f = strong ? bold : font;
    page.drawText(clean(label), { x: labelX, y: ry, size: strong ? 10 : 9, font: f, color: strong ? BRAND : INK });
    const v = clean(value);
    page.drawText(v, { x: A4.w - M - 4 - f.widthOfTextAtSize(v, strong ? 10 : 9), y: ry, size: strong ? 10 : 9, font: f, color: strong ? BRAND : INK });
  }
  y = Math.min(ty, ry) - 22;

  // ---- Montant en lettres, notes, coordonnées bancaires ----------------------------------------
  const words = `${data.wordsIntro} ${amountInWords(data.wordsAmount)}.`;
  const wordLines = wrap(words, A4.w - 2 * M, 9, bold);
  ensure(wordLines.length * 12 + 20);
  for (const wl of wordLines) { text(wl, M, 9, bold); y -= 12; }
  y -= 6;

  if (data.notes) {
    const noteLines = data.notes.split("\n").flatMap((n) => wrap(n, A4.w - 2 * M, 8.5));
    ensure(noteLines.length * 11 + 16);
    text("Notes", M, 8, bold, MUTED); y -= 12;
    for (const nl of noteLines) { text(nl, M, 8.5, font, MUTED); y -= 11; }
    y -= 4;
  }
  if (c.rib || c.bankName) {
    ensure(30);
    text("Coordonnées bancaires", M, 8, bold, MUTED); y -= 12;
    text([c.bankName, c.rib ? `RIB : ${c.rib}` : null].filter(Boolean).join(" — "), M, 8.5, font, MUTED);
  }

  // ---- Pieds de page, numéros de page et filigrane (sur toutes les pages) -----------------------
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const foot = clean(
      [c.legalName, c.matriculeFiscal ? `MF ${c.matriculeFiscal}` : null, data.fingerprint ? `empreinte ${data.fingerprint}` : null]
        .filter(Boolean).join(" · "),
    );
    p.drawLine({ start: { x: M, y: 40 }, end: { x: A4.w - M, y: 40 }, thickness: 0.6, color: LINE });
    p.drawText(foot, { x: M, y: 28, size: 7.5, font, color: MUTED });
    const pageLabel = `Page ${i + 1} / ${pages.length}`;
    p.drawText(pageLabel, { x: A4.w - M - font.widthOfTextAtSize(pageLabel, 7.5), y: 28, size: 7.5, font, color: MUTED });
    if (data.isDraft) {
      p.drawText("BROUILLON", {
        x: 130, y: 250, size: 96, font: bold, color: rgb(0.85, 0.15, 0.15), opacity: 0.1, rotate: degrees(40),
      });
    }
  });

  return pdf.save();
}
