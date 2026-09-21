import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import type { Db } from "./types";
import { createUser } from "../lib/users";
import { MIN_PRODUCTION_PASSWORD_LENGTH, isWeakAdminPassword } from "../lib/config-check";

async function main() {
  const url = process.env.DATABASE_URL;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!url || !email || !password) {
    throw new Error("DATABASE_URL, ADMIN_EMAIL et ADMIN_PASSWORD sont requis");
  }

  if (process.env.NODE_ENV === "production" && isWeakAdminPassword(password)) {
    throw new Error(
      `ADMIN_PASSWORD est public ou trop court : en production, choisissez un mot de passe d'au moins ${MIN_PRODUCTION_PASSWORD_LENGTH} caractères qui ne vient pas des exemples.`,
    );
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema }) as unknown as Db;

  try {
    const existing = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
    if (existing.length > 0) {
      console.log("Des utilisateurs existent déjà : aucun administrateur créé.");
      return;
    }
    await createUser(db, null, {
      email,
      name: process.env.ADMIN_NAME ?? "Administrateur",
      role: "admin",
      password,
    });
    console.log(`Administrateur créé : ${email}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
