import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // La compilation (`next build`, y compris en intégration continue) importe ce module sans base : un pool
    // jamais utilisé suffit, il ne se connecte qu'à la première requête. À l'exécution, l'absence d'URL reste une erreur franche.
    if (process.env.NEXT_PHASE === "phase-production-build") return new Pool({ connectionString: "postgres://build:build@127.0.0.1:1/build" });
    throw new Error("DATABASE_URL n'est pas défini");
  }
  return new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX) || 10 });
}

// Réutilise le pool entre les rechargements à chaud en développement.
const pool = (globalForDb.pool ??= createPool());

export const db = drizzle(pool, { schema });
export type Database = typeof db;
