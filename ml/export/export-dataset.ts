/**
 * Creates/refreshes the ML views (schema "ml") and exports them for Power BI / Excel.
 *
 *   npm run ml:views     # only (re)create the views, e.g. before connecting Power BI
 *   npm run ml:export    # views + CSV export to ml/data/export/ + Excel workbook
 *
 * Uses DATABASE_URL, i.e. whatever database the app points to. Exported files land in
 * ml/data/ (git-ignored): when the database holds real client data, keep them private.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const ROOT = process.cwd();
const VIEWS_SQL = join(ROOT, "ml", "sql", "views.sql");
const EXPORT_DIR = join(ROOT, "ml", "data", "export");
const VIEWS = ["invoice_features", "invoice_lines", "client_features", "monthly_cashflow"] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const viewsOnly = process.argv.includes("--views-only");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const dbName = new URL(url).pathname.replace(/^\//, "");

  // Return DATE columns as plain "YYYY-MM-DD" strings (no time-zone shift).
  pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
  const client = new pg.Client({ connectionString: url.replace(/\?.*$/, "") });
  await client.connect();
  try {
    await client.query(readFileSync(VIEWS_SQL, "utf8"));
    console.log(`ML views ready in database "${dbName}" (schema ml: ${VIEWS.join(", ")})`);
    if (viewsOnly) return;

    if (!dbName.endsWith("_demo")) {
      console.warn(`Warning: "${dbName}" is not a demo database. The export contains real client data; keep it private.`);
    }
    mkdirSync(EXPORT_DIR, { recursive: true });
    for (const view of VIEWS) {
      const { rows, fields } = await client.query(`SELECT * FROM ml.${view}`);
      const header = fields.map((f) => f.name);
      const lines = [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))];
      // UTF-8 BOM so Excel detects the encoding (accents, Arabic names); Power BI ignores it.
      writeFileSync(join(EXPORT_DIR, `${view}.csv`), "﻿" + lines.join("\n") + "\n");
      console.log(`  ${view.padEnd(17)} ${String(rows.length).padStart(6)} rows -> ml/data/export/${view}.csv`);
    }
  } finally {
    await client.end();
  }

  const python = process.platform === "win32" ? "python" : "python3";
  const result = spawnSync(python, [join("ml", "export", "csv_to_excel.py")], { stdio: "inherit", cwd: ROOT });
  if (result.status !== 0) {
    console.warn("Excel workbook not created (Python with pandas + openpyxl is required). The CSV files are ready.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
