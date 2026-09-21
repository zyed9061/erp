import type { Db } from "@/db/types";
import { toCsv, num } from "./csv";
import { PAYMENT_METHOD_LABELS } from "./payments-labels";
import { AGE_BUCKETS, AGE_LABELS, agedReceivables, parsePeriod, paymentsReport, revenueReport, vatReport, withholdingReport } from "./reports";
import { todayTunis } from "./dates";

export const EXPORT_TYPES = ["ca-mensuel", "ca-clients", "balance-agee", "tva", "retenues", "encaissements"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const isExportType = (v: string): v is ExportType => (EXPORT_TYPES as readonly string[]).includes(v);

/** Contenu CSV et nom de fichier d'un rapport. Les paramètres invalides retombent sur l'année en cours / aujourd'hui. */
export async function buildReportCsv(
  db: Db, type: ExportType, params: { from?: string; to?: string; asOf?: string },
): Promise<{ filename: string; csv: string }> {
  const period = parsePeriod(params.from, params.to);
  const tag = `${period.from}_${period.to}`;

  switch (type) {
    case "ca-mensuel":
    case "ca-clients": {
      const r = await revenueReport(db, period);
      const rows = type === "ca-mensuel" ? r.byMonth : r.byCustomer;
      return {
        filename: `chiffre-affaires-${type === "ca-mensuel" ? "mensuel" : "clients"}_${tag}.csv`,
        csv: toCsv(
          [type === "ca-mensuel" ? "Mois" : "Client", "Documents", "Total HT", "FODEC", "TVA", "Total TTC"],
          [
            ...rows.map((x) => [x.label, x.count, num(x.ht), num(x.fodec), num(x.tva), num(x.ttc)]),
            ["Total", r.totals.count, num(r.totals.ht), num(r.totals.fodec), num(r.totals.tva), num(r.totals.ttc)],
          ],
        ),
      };
    }
    case "balance-agee": {
      const asOf = params.asOf && /^\d{4}-\d{2}-\d{2}$/.test(params.asOf) ? params.asOf : todayTunis();
      const r = await agedReceivables(db, asOf);
      return {
        filename: `balance-agee_${asOf}.csv`,
        csv: toCsv(
          ["Client", ...AGE_BUCKETS.map((b) => AGE_LABELS[b]), "Total"],
          [
            ...r.rows.map((x) => [x.customerName, ...AGE_BUCKETS.map((b) => num(x[b])), num(x.total)]),
            ["Total", ...AGE_BUCKETS.map((b) => num(r.totals[b])), num(r.totals.total)],
          ],
        ),
      };
    }
    case "tva": {
      const r = await vatReport(db, period);
      return {
        filename: `tva-fodec-timbre_${tag}.csv`,
        csv: toCsv(
          ["Type", "Taux (%)", "Base", "Montant"],
          [
            ...r.byRate.map((x) => [x.kind === "tva" ? "TVA" : "FODEC", num(x.rate), num(x.base), num(x.amount)]),
            ["Total TVA collectée", null, null, num(r.totals.tva)],
            ["Total FODEC", null, null, num(r.totals.fodec)],
            ["Timbre fiscal", null, null, num(r.totals.stampDuty)],
          ],
        ),
      };
    }
    case "retenues": {
      const r = await withholdingReport(db, period);
      return {
        filename: `retenues-a-la-source_${tag}.csv`,
        csv: toCsv(
          ["Facture", "Date", "Client", "Taux (%)", "Retenue", "Certificats reçus", "Reste à justifier"],
          [
            ...r.rows.map((x) => [x.number, x.issueDate, x.customerName, num(x.rate), num(x.amount), num(x.certified), num(x.missing)]),
            ["Total", null, null, null, num(r.totals.amount), num(r.totals.certified), num(r.totals.missing)],
          ],
        ),
      };
    }
    case "encaissements": {
      const r = await paymentsReport(db, period);
      return {
        filename: `encaissements_${tag}.csv`,
        csv: toCsv(
          ["Rubrique", "Paiements", "Montant"],
          [
            ...r.byMonth.map((x) => [x.key, x.count, num(x.amount)]),
            ...r.byMethod.filter((x) => x.count > 0).map((x) => [`Mode : ${PAYMENT_METHOD_LABELS[x.method]}`, x.count, num(x.amount)]),
            ["Total", r.totals.count, num(r.totals.amount)],
          ],
        ),
      };
    }
  }
}
