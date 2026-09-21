import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
import type { Db } from "../db/types";
import { runReminders } from "../lib/invoicing/reminders";

/** Envoie les relances dues. À planifier une fois par jour : `npm run reminders`. */
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL n'est pas défini");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const db = drizzle(pool, { schema }) as unknown as Db;
    const summary = await runReminders(db);
    console.log(`Relances : ${summary.sent.length} envoyée(s), ${summary.skipped.length} ignorée(s), ${summary.failed.length} en échec.`);
    for (const f of summary.failed) console.error(`  échec ${f.number} : ${f.error}`);
    for (const s of summary.skipped) console.warn(`  ignorée ${s.number} : ${s.reason}`);
    if (summary.failed.length > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
