// Parcours complets « navigateur » : formulaires réels, rôles, exports, en-têtes de sécurité.
// Usage : npm run build && npm run e2e   (base embarquée neuve à chaque exécution, aucune donnée existante n'est touchée)
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

if (!existsSync(".next/BUILD_ID")) {
  console.error("Lancez d'abord `npm run build`.");
  process.exit(1);
}

const demo = process.argv.includes("--demo");
const env = {
  ...process.env,
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5544/postgres?sslmode=disable",
  DATABASE_POOL_MAX: "1", ADMIN_EMAIL: "admin@example.tn", ADMIN_PASSWORD: "ChangeMe-12345", COOKIE_SECURE: "false", CRON_SECRET: "secret-e2e", ...(demo ? { DEMO_MODE: "true" } : {}),
};
const run = (cmd, args) => new Promise((resolve) => spawn(cmd, args, { env, stdio: "inherit", shell: true }).on("exit", resolve));

const db = await PGlite.create();
const dbServer = new PGLiteSocketServer({ db, port: 5544, host: "127.0.0.1" });
await dbServer.start();
let app;
let failed = 0;
try {
  if ((await run("npx", ["tsx", "src/db/migrate.ts"])) !== 0 || (await run("npx", ["tsx", demo ? "src/scripts/seed-demo.ts" : "src/db/seed.ts"])) !== 0) throw new Error("Préparation de la base impossible");
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3100"], { env, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 9000));
  const dir = demo ? "demo" : "e2e";
  for (const file of readdirSync(dir).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort()) {
    console.log(`\n=== ${dir}/${file} ===`);
    if ((await run("node", [`${dir}/${file}`])) !== 0) { failed++; break; } // les scénarios se suivent : inutile de continuer après un échec
  }
} finally {
  app?.kill();
  await dbServer.stop();
  await db.close();
}
console.log(failed ? "\nÉCHEC des parcours e2e" : "\nTOUS LES PARCOURS E2E PASSENT");
process.exit(failed ? 1 : 0);
