import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
import type { Db } from "../db/types";
import { runRecurring } from "../lib/invoicing/recurring";

/** Génère les factures récurrentes échues. À planifier une fois par jour : `npm run recurring`. */
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL n'est pas défini");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const db = drizzle(pool, { schema }) as unknown as Db;
    const summary = await runRecurring(db);
    console.log(`Récurrentes : ${summary.generated.length} facture(s) générée(s), ${summary.failed.length} en échec.`);
    for (const g of summary.generated) console.log(`  ${g.templateName} — ${g.scheduledDate} → ${g.invoiceNumber ?? "brouillon"}`);
    for (const f of summary.failed) console.error(`  échec ${f.templateName} (${f.scheduledDate}) : ${f.error}`);
    if (summary.failed.length > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
