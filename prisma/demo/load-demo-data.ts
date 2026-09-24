/**
 * Loads the ML demo dataset into a dedicated demo database.
 *
 *   npm run demo:data                 # create/migrate/seed the demo DB, then load data
 *   npm run demo:data -- --reset      # wipe the demo DB's business data first
 *   npm run demo:data -- --seed 7     # a different (still reproducible) dataset
 *
 * Target: DEMO_DATABASE_URL, or DATABASE_URL with "_demo" appended to the database name.
 * For safety the script refuses any database whose name does not end with "_demo", so
 * real data can never be overwritten. Ground truth (personas, true late-payment
 * probabilities, injected anomalies) is written to ml/data/ as CSV, never to the database.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { DEFAULT_OPTIONS, DEFAULT_TERM_DAYS, LATE_THRESHOLD_DAYS, generateDemoDataset, type DemoDataset } from "./generate";

const OUTPUT_DIR = join(process.cwd(), "ml", "data");
const CHUNK = 1000;

function parseArgs(argv: string[]) {
  const args = { reset: false, seed: DEFAULT_OPTIONS.seed, referenceDate: undefined as Date | undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--reset") args.reset = true;
    else if (argv[i] === "--seed") args.seed = Number(argv[++i]);
    else if (argv[i] === "--reference-date") args.referenceDate = new Date(`${argv[++i]}T10:00:00Z`);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!Number.isInteger(args.seed)) throw new Error("--seed must be an integer");
  return args;
}

function resolveDemoUrl(): URL {
  const explicit = process.env.DEMO_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!explicit && !base) throw new Error("Set DEMO_DATABASE_URL or DATABASE_URL in .env");
  const url = new URL(explicit ?? base!);
  const baseName = url.pathname.replace(/^\//, "");
  // DATABASE_URL may already point at the demo DB (to browse it in the app): don't append twice.
  if (!explicit && !baseName.endsWith("_demo")) url.pathname = `${baseName}_demo`;
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName.endsWith("_demo")) {
    throw new Error(`Refusing to write demo data into "${dbName}": the database name must end with "_demo".`);
  }
  return url;
}

async function ensureDatabase(url: URL) {
  const admin = new URL(url);
  admin.pathname = "/postgres";
  admin.search = "";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const dbName = url.pathname.replace(/^\//, "");
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    console.log(`Created database ${dbName}`);
  }
  await client.end();
}

function runPrisma(args: string[], url: URL) {
  // Arguments are fixed strings from this file, so a single shell command line is safe here
  // (and avoids Node's DEP0190 warning about passing an args array with shell: true).
  const result = spawnSync(`npx prisma ${args.join(" ")}`, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
  if (result.status !== 0) throw new Error(`prisma ${args.join(" ")} failed`);
}

/** Drops the nested `lignes` array so the row matches the parent table. */
function withoutLines<T extends { lignes: unknown }>(doc: T): Omit<T, "lignes"> {
  const copy: Partial<T> = { ...doc };
  delete copy.lignes;
  return copy as Omit<T, "lignes">;
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

async function load(prisma: PrismaClient, data: DemoDataset, createdById: string) {
  await prisma.produit.createMany({ data: data.products.map((p) => ({ ...p, actif: true })) });
  await prisma.client.createMany({ data: data.clients.map((c) => ({ ...c, pays: "Tunisie", actif: true })) });

  for (const batch of chunks(data.quotes)) {
    await prisma.devis.createMany({
      data: batch.map((d) => ({ ...withoutLines(d), createdById, createdAt: d.dateEmission })),
    });
  }
  for (const batch of chunks(data.quotes.flatMap((d) => d.lignes.map((l) => ({ ...l, devisId: d.id }))))) {
    await prisma.ligneDevis.createMany({ data: batch });
  }

  for (const batch of chunks(data.invoices)) {
    await prisma.facture.createMany({
      data: batch.map((f) => ({ ...withoutLines(f), createdById, createdAt: f.dateEmission })),
    });
  }
  for (const batch of chunks(data.invoices.flatMap((f) => f.lignes.map((l) => ({ ...l, factureId: f.id }))))) {
    await prisma.ligneFacture.createMany({ data: batch });
  }
  for (const batch of chunks(data.payments)) {
    await prisma.paiement.createMany({ data: batch.map((p) => ({ ...p, createdById, createdAt: p.datePaiement })) });
  }

  await prisma.avoir.createMany({
    data: data.creditNotes.map((a) => ({ ...withoutLines(a), createdById, createdAt: a.dateEmission })),
  });
  await prisma.ligneAvoir.createMany({
    data: data.creditNotes.flatMap((a) => a.lignes.map((l) => ({ ...l, avoirId: a.id }))),
  });

  // Keep the app's numbering in sync so new documents continue after the demo ones.
  for (const n of data.numbering) {
    await prisma.numberingSequence.upsert({
      where: { type_annee: { type: n.type, annee: n.annee } },
      update: { dernierNumero: n.dernierNumero },
      create: n,
    });
  }
}

async function wipe(prisma: PrismaClient) {
  await prisma.$transaction([
    prisma.paiement.deleteMany(),
    prisma.ligneAvoir.deleteMany(),
    prisma.avoir.deleteMany(),
    prisma.ligneFacture.deleteMany(),
    prisma.facture.deleteMany(),
    prisma.ligneDevis.deleteMany(),
    prisma.devis.deleteMany(),
    prisma.produit.deleteMany(),
    prisma.client.deleteMany(),
    prisma.numberingSequence.deleteMany(),
  ]);
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\n") + "\n";
}

function writeGroundTruth(data: DemoDataset) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "demo-client-personas.csv"), toCsv(data.truth.clientPersonas));
  writeFileSync(join(OUTPUT_DIR, "demo-invoice-truth.csv"), toCsv(data.truth.invoices as unknown as Record<string, unknown>[]));
  writeFileSync(join(OUTPUT_DIR, "demo-anomalies.csv"), toCsv(data.truth.anomalies as unknown as Record<string, unknown>[]));
  writeFileSync(
    join(OUTPUT_DIR, "demo-manifest.json"),
    JSON.stringify(
      {
        seed: data.options.seed,
        referenceDate: data.options.referenceDate.toISOString(),
        lateThresholdDays: LATE_THRESHOLD_DAYS,
        defaultTermDays: DEFAULT_TERM_DAYS,
        counts: {
          clients: data.clients.length,
          products: data.products.length,
          quotes: data.quotes.length,
          invoices: data.invoices.length,
          payments: data.payments.length,
          creditNotes: data.creditNotes.length,
          anomalies: data.truth.anomalies.length,
        },
      },
      null,
      2,
    ) + "\n",
  );
}

function printSummary(data: DemoDataset) {
  const DAY = 86_400_000;
  const statusCounts: Record<string, number> = {};
  for (const f of data.invoices) statusCounts[f.statut] = (statusCounts[f.statut] ?? 0) + 1;

  const persona = new Map(data.truth.clientPersonas.map((c) => [c.clientId, c.persona]));
  const lastPayment = new Map<string, number>();
  for (const p of data.payments) lastPayment.set(p.factureId, Math.max(lastPayment.get(p.factureId) ?? 0, p.datePaiement.getTime()));
  const late: Record<string, { late: number; total: number }> = {};
  for (const f of data.invoices.filter((i) => i.statut === "PAYEE")) {
    const due = (f.dateEcheance ?? new Date(f.dateEmission.getTime() + DEFAULT_TERM_DAYS * DAY)).getTime();
    const key = persona.get(f.clientId)!;
    late[key] ??= { late: 0, total: 0 };
    late[key].total++;
    if (lastPayment.get(f.id)! > due + LATE_THRESHOLD_DAYS * DAY) late[key].late++;
  }
  const allLate = Object.values(late).reduce((s, v) => s + v.late, 0);
  const allPaid = Object.values(late).reduce((s, v) => s + v.total, 0);

  console.log("\nDemo dataset loaded");
  console.log(`  clients ${data.clients.length}, products ${data.products.length}, quotes ${data.quotes.length}`);
  console.log(`  invoices ${data.invoices.length}, payments ${data.payments.length}, credit notes ${data.creditNotes.length}`);
  console.log(`  invoice statuses: ${JSON.stringify(statusCounts)}`);
  console.log(`  paid invoices (ML training rows): ${allPaid}, of which late (> ${LATE_THRESHOLD_DAYS} days): ${allLate} (${Math.round((100 * allLate) / allPaid)}%)`);
  for (const [key, v] of Object.entries(late)) {
    console.log(`    ${key.padEnd(12)} ${String(v.total).padStart(4)} paid, ${Math.round((100 * v.late) / v.total)}% late`);
  }
  console.log(`  injected anomalies: ${data.truth.anomalies.length}`);
  console.log(`  ground truth written to ${OUTPUT_DIR}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = resolveDemoUrl();
  console.log(`Target database: ${url.pathname.replace(/^\//, "")} on ${url.host}`);

  await ensureDatabase(url);
  runPrisma(["migrate", "deploy"], url);
  runPrisma(["db", "seed"], url);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  try {
    const existing = (await prisma.facture.count()) + (await prisma.client.count());
    if (existing > 0 && !args.reset) {
      throw new Error("The demo database already contains data. Re-run with --reset to replace it.");
    }
    if (existing > 0) {
      await wipe(prisma);
      console.log("Existing demo data removed");
    }

    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    if (!admin) throw new Error("No admin user found in the demo database (the seed step should create one).");

    const today = new Date();
    const referenceDate =
      args.referenceDate ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 10));
    const data = generateDemoDataset({ ...DEFAULT_OPTIONS, seed: args.seed, referenceDate });

    await load(prisma, data, admin.id);
    writeGroundTruth(data);
    printSummary(data);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
