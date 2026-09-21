import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
import type { Db } from "../db/types";
import { checkData, checkEnvironment, worstStatus, type ConfigCheck } from "../lib/config-check";

/** Diagnostic de configuration en français simple : `npm run check:config`. Code de sortie 1 s'il y a une erreur. */
const ICON = { ok: "[OK]     ", warn: "[A FAIRE]", error: "[ERREUR] ", info: "[INFO]   " } as const;

async function main() {
  const checks: ConfigCheck[] = checkEnvironment();
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      checks.push(...(await checkData(drizzle(pool, { schema }) as unknown as Db)));
    } catch (e) {
      checks.push({ id: "db-access", label: "Accès à la base", status: "error", detail: `Connexion impossible : ${(e as Error).message}`, fix: "Démarrer la base (npm run dev:local ou Docker) et vérifier DATABASE_URL." });
    } finally {
      await pool.end();
    }
  }
  for (const c of checks) {
    console.log(`${ICON[c.status]} ${c.label} : ${c.detail}`);
    if (c.fix) console.log(`           -> ${c.fix}`);
  }
  const worst = worstStatus(checks);
  console.log(worst === "ok" ? "\nConfiguration prête." : worst === "error" ? "\nDes erreurs empêchent une mise en production." : "\nDes points restent à traiter avant la mise en production.");
  process.exitCode = worst === "error" ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
