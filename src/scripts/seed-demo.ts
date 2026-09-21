import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
import type { Db } from "../db/types";
import { DEMO_ACCOUNTS } from "../lib/demo/accounts";
import { seedDemoData } from "../lib/demo/seed";

/** Installe les données de DÉMONSTRATION fictives : `npm run db:seed:demo` (avec DEMO_MODE=true pour la TTN simulée). */
async function main() {
  process.env.DEMO_MODE = "true"; // la simulation TTN/signature est nécessaire pour préparer les documents de démonstration
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL n'est pas défini");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const { seeded } = await seedDemoData(drizzle(pool, { schema }) as unknown as Db);
    console.log(seeded ? "Données de démonstration installées (toutes fictives)." : "Les données de démonstration existent déjà.");
    for (const a of DEMO_ACCOUNTS) console.log(`  ${a.role.padEnd(14)} ${a.email} / ${a.password}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
