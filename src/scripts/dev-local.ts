import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

/**
 * Démarrage local SANS Docker : une base PostgreSQL embarquée (PGlite, stockée dans .data/pglite), les migrations,
 * le compte administrateur, puis le serveur de développement. Commande : `npm run dev:local`.
 * Réservé au développement et aux essais : en production, utiliser un vrai PostgreSQL (voir le README).
 */
const PORT = 5544;
const DATA_DIR = ".data/pglite";

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = await PGlite.create(DATA_DIR);
  const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
  await server.start();

  const env = {
    ...process.env,
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`,
    DATABASE_POOL_MAX: "1", // la base embarquée n'accepte qu'une connexion à la fois
    // Démonstration par défaut (données fictives, TTN/signature/QR simulés) ; DEMO_MODE=false pour une base vide.
    DEMO_MODE: process.env.DEMO_MODE ?? "true",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "admin@example.tn",
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "ChangeMe-12345",
    COOKIE_SECURE: "false",
  };

  // Asynchrone obligatoire : la base tourne dans CE processus, un appel bloquant l'empêcherait de répondre.
  const demo = env.DEMO_MODE === "true";
  for (const script of ["src/db/migrate.ts", demo ? "src/scripts/seed-demo.ts" : "src/db/seed.ts"]) {
    const code = await new Promise<number | null>((resolve) => spawn("npx", ["tsx", script], { env, stdio: "inherit", shell: true }).on("exit", resolve));
    if (code !== 0) throw new Error(`${script} a échoué`);
  }
  console.log(
    demo
      ? `DÉMONSTRATION prête (${DATA_DIR}) : données fictives, TTN / signature / QR code simulés. Comptes ci-dessus et sur la page de connexion.`
      : `Base locale prête (${DATA_DIR}). Connexion : ${env.ADMIN_EMAIL} / ${env.ADMIN_PASSWORD}`,
  );

  const next = spawn("npx", ["next", "dev"], { env, stdio: "inherit", shell: true });
  const stop = async () => {
    next.kill();
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  next.on("exit", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
