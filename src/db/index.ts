import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas défini");
  return new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX) || 10 });
}

// Réutilise le pool entre les rechargements à chaud en développement.
const pool = (globalForDb.pool ??= createPool());

export const db = drizzle(pool, { schema });
export type Database = typeof db;
