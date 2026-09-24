/**
 * Loads the scores produced by ml/train/train.py into the app database.
 *
 *   npm run ml:import-scores   # usually via `npm run ml:train`
 *
 * Reads ml/data/scores/{invoice_scores.csv, client_segments.csv, run.json} and replaces the
 * content of ml_invoice_scores and ml_client_segments in one transaction, so the app never
 * shows a half-imported run. Rows for invoices/clients that no longer exist are skipped.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import type { ClientSegment, MlRiskLevel } from "../../src/generated/prisma/enums";

const SCORES_DIR = join(process.cwd(), "ml", "data", "scores");

/** Minimal RFC 4180 parser (quoted fields, doubled quotes, newlines inside quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => r.length > 1 || r[0] !== "");
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.replace(/^﻿/, ""), r[i] ?? ""])));
}

const orNull = (value: string) => (value === "" ? null : value);
const json = (value: string) => (value === "" ? Prisma.DbNull : (JSON.parse(value) as Prisma.InputJsonValue));

async function main() {
  const run = JSON.parse(readFileSync(join(SCORES_DIR, "run.json"), "utf8"));
  const invoiceRows = parseCsv(readFileSync(join(SCORES_DIR, "invoice_scores.csv"), "utf8"));
  const segmentRows = parseCsv(readFileSync(join(SCORES_DIR, "client_segments.csv"), "utf8"));
  const scoredAt = new Date(run.trained_at);
  const modelVersion: string = run.model_version;

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const existingInvoices = new Set((await prisma.facture.findMany({ select: { id: true } })).map((f) => f.id));
    const existingClients = new Set((await prisma.client.findMany({ select: { id: true } })).map((c) => c.id));

    const invoiceScores = invoiceRows
      .filter((r) => existingInvoices.has(r.facture_id))
      .map((r) => ({
        factureId: r.facture_id,
        lateProbability: orNull(r.late_probability),
        riskLevel: (orNull(r.risk_level) as MlRiskLevel | null) ?? null,
        reasons: json(r.reasons),
        predictedDaysLate: r.predicted_days_late === "" ? null : Math.round(Number(r.predicted_days_late)),
        expectedPaymentDate: r.expected_payment_date ? new Date(`${r.expected_payment_date}T10:00:00Z`) : null,
        isAnomaly: r.is_anomaly === "True",
        anomalyScore: orNull(r.anomaly_score),
        anomalyReasons: json(r.anomaly_reasons),
        modelVersion,
        scoredAt,
      }));
    const segments = segmentRows
      .filter((r) => existingClients.has(r.client_id))
      .map((r) => ({ clientId: r.client_id, segment: r.segment as ClientSegment, modelVersion, scoredAt }));

    await prisma.$transaction([
      prisma.mlInvoiceScore.deleteMany(),
      prisma.mlClientSegment.deleteMany(),
      prisma.mlInvoiceScore.createMany({ data: invoiceScores }),
      prisma.mlClientSegment.createMany({ data: segments }),
      prisma.mlModelRun.upsert({
        where: { modelVersion },
        update: { trainedAt: scoredAt, demoData: Boolean(run.demo_data), metrics: run },
        create: { modelVersion, trainedAt: scoredAt, demoData: Boolean(run.demo_data), metrics: run },
      }),
    ]);

    const risky = invoiceScores.filter((s) => s.riskLevel === "HIGH").length;
    const flagged = invoiceScores.filter((s) => s.isAnomaly).length;
    const skipped = invoiceRows.length - invoiceScores.length + segmentRows.length - segments.length;
    console.log(`Imported model ${modelVersion}: ${invoiceScores.length} invoice scores (${risky} high risk, ${flagged} unusual), `
      + `${segments.length} client segments${skipped ? `, ${skipped} rows skipped (no longer in the database)` : ""}.`);
  } finally {
    await prisma.$disconnect();
  }
}

// Allow importing parseCsv in tests without running the import.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("ml/export/import-scores.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
