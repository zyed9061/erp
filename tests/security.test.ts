import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { updateCompany } from "@/lib/company";
import { checkData, checkEnvironment, isWeakAdminPassword, worstStatus } from "@/lib/config-check";
import { createUser, updateUser } from "@/lib/users";
import { createTestDb } from "./helpers";
import { AttemptLimiter } from "@/lib/auth/rate-limit";
import { smtpConfigFromEnv } from "@/lib/mail/transport";

describe("limitation des tentatives de connexion par adresse IP", () => {
  it("bloque après le maximum de tentatives, puis débloque à la fin de la fenêtre glissante", () => {
    let t = 0;
    const limiter = new AttemptLimiter(3, 1000, () => t);
    for (let i = 0; i < 3; i++) {
      expect(limiter.isBlocked("1.2.3.4")).toBe(false);
      limiter.record("1.2.3.4");
      t += 100;
    }
    expect(limiter.isBlocked("1.2.3.4")).toBe(true);
    expect(limiter.isBlocked("5.6.7.8")).toBe(false); // une autre adresse n'est pas touchée
    t = 1050; // la première tentative (t=0) sort de la fenêtre
    expect(limiter.isBlocked("1.2.3.4")).toBe(false);
    limiter.record("1.2.3.4");
    expect(limiter.isBlocked("1.2.3.4")).toBe(true);
    t = 5000;
    expect(limiter.isBlocked("1.2.3.4")).toBe(false);
  });
});

describe("configuration SMTP sécurisée par défaut", () => {
  const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

  it("reste en mode journal sans SMTP_HOST (aucun envoi réel), y compris avec un hôte vide ou d'espaces", () => {
    expect(smtpConfigFromEnv(env({}))).toBeNull();
    expect(smtpConfigFromEnv(env({ SMTP_HOST: "", MAIL_FROM: "a@b.tn" }))).toBeNull();
    expect(smtpConfigFromEnv(env({ SMTP_HOST: "   " }))).toBeNull();
  });

  it("exige le chiffrement (STARTTLS obligatoire ou TLS direct) et TLS 1.2 minimum", () => {
    const starttls = smtpConfigFromEnv(env({ SMTP_HOST: "smtp.exemple.tn", MAIL_FROM: "Facturation <f@exemple.tn>" }))!;
    expect(starttls.options).toMatchObject({ port: 587, secure: false, requireTLS: true, tls: { minVersion: "TLSv1.2" } });
    const direct = smtpConfigFromEnv(env({ SMTP_HOST: "smtp.exemple.tn", SMTP_PORT: "465", MAIL_FROM: "f@exemple.tn" }))!;
    expect(direct.options).toMatchObject({ port: 465, secure: true, requireTLS: false });
  });

  it("n'autorise le clair que sur demande explicite", () => {
    const c = smtpConfigFromEnv(env({ SMTP_HOST: "localhost", SMTP_PORT: "1025", SMTP_ALLOW_INSECURE: "true", MAIL_FROM: "f@x.tn" }))!;
    expect(c.options.requireTLS).toBe(false);
  });

  it("refuse une configuration incohérente avec un message clair", () => {
    expect(() => smtpConfigFromEnv(env({ SMTP_HOST: "h" }))).toThrow(/MAIL_FROM/);
    expect(() => smtpConfigFromEnv(env({ SMTP_HOST: "h", MAIL_FROM: "sans-arobase" }))).toThrow(/adresse e-mail/);
    expect(() => smtpConfigFromEnv(env({ SMTP_HOST: "h", MAIL_FROM: "a@b.tn", SMTP_PORT: "abc" }))).toThrow(/SMTP_PORT/);
    expect(() => smtpConfigFromEnv(env({ SMTP_HOST: "h", MAIL_FROM: "a@b.tn", SMTP_PORT: "70000" }))).toThrow(/SMTP_PORT/);
  });

  it("transmet les identifiants uniquement s'ils sont fournis", () => {
    expect(smtpConfigFromEnv(env({ SMTP_HOST: "h", MAIL_FROM: "a@b.tn" }))!.options.auth).toBeUndefined();
    expect(smtpConfigFromEnv(env({ SMTP_HOST: "h", MAIL_FROM: "a@b.tn", SMTP_USER: "u", SMTP_PASS: "p" }))!.options.auth).toEqual({ user: "u", pass: "p" });
  });
});

describe("diagnostic de configuration", () => {
  const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
  const byId = (checks: ReturnType<typeof checkEnvironment>, id: string) => checks.find((c) => c.id === id)!;

  it("signale ce qui manque sans jamais afficher un secret", () => {
    const checks = checkEnvironment(env({ NODE_ENV: "production", CRON_SECRET: "un-secret-tres-confidentiel-123456", SMTP_HOST: "", ADMIN_PASSWORD: "ChangeMe-12345" }));
    expect(byId(checks, "database").status).toBe("error");
    expect(byId(checks, "smtp").status).toBe("warn");
    expect(byId(checks, "smtp").detail).toContain("AUCUN e-mail réel");
    expect(byId(checks, "cron").status).toBe("ok");
    expect(byId(checks, "admin-env").status).toBe("error");
    expect(JSON.stringify(checks)).not.toContain("un-secret-tres-confidentiel");
    expect(JSON.stringify(checks)).not.toContain("ChangeMe-12345");
    expect(worstStatus(checks)).toBe("error");
  });

  it("valide un environnement complet et distingue le développement de la production", () => {
    const good = { DATABASE_URL: "postgres://x", CRON_SECRET: "x".repeat(32), SMTP_HOST: "smtp.exemple.tn", MAIL_FROM: "f@exemple.tn", ADMIN_PASSWORD: "un-bon-mot-de-passe-long" };
    expect(worstStatus(checkEnvironment(env({ ...good, NODE_ENV: "production" })))).toBe("ok");
    expect(byId(checkEnvironment(env({ ...good, NODE_ENV: "production", COOKIE_SECURE: "false" })), "cookie").status).toBe("warn");
    expect(byId(checkEnvironment(env({ ...good, NODE_ENV: "development", COOKIE_SECURE: "false" })), "cookie").status).toBe("info");
    expect(byId(checkEnvironment(env({ ...good, SMTP_ALLOW_INSECURE: "true", SMTP_PORT: "1025" })), "smtp").status).toBe("warn");
    expect(byId(checkEnvironment(env({ ...good, SMTP_PORT: "abc" })), "smtp").status).toBe("error");
    expect(byId(checkEnvironment(env({ ...good, CRON_SECRET: "court" })), "cron").status).toBe("warn");
  });

  it("reconnaît les mots de passe publics ou trop courts", () => {
    expect(["ChangeMe-12345", "Password-12345", "admin", "court"].every(isWeakAdminPassword)).toBe(true);
    expect(isWeakAdminPassword("un-bon-mot-de-passe-long")).toBe(false);
  });
});

describe("diagnostic de configuration : données", () => {
  let db: Db;
  let close: () => Promise<void>;
  let adminId: string;
  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    adminId = (await createUser(db, null, { email: "admin@example.tn", name: "Admin", role: "admin", password: "ChangeMe-12345" })).id;
  });
  afterAll(() => close());

  it("détecte un administrateur qui a encore un mot de passe public, puis le voit corrigé", async () => {
    const before = (await checkData(db)).find((c) => c.id === "default-password")!;
    expect(before.status).toBe("error");
    expect(before.detail).toContain("admin@example.tn");
    await updateUser(db, { id: adminId, email: "admin@example.tn" }, adminId, { password: "Un-Vrai-Mot-De-Passe-2026" });
    expect((await checkData(db)).find((c) => c.id === "default-password")!.status).toBe("ok");
  });

  it("signale une société incomplète, puis complète, et le TEIF encore à fournir", async () => {
    expect((await checkData(db)).find((c) => c.id === "company")!.status).toBe("warn");
    await updateCompany(db, { id: adminId, email: "admin@example.tn" }, {
      legalName: "ACME SARL", matriculeFiscal: "7654321B/A/M/000", address: "1 rue A", city: "Tunis", taxRegime: "reel", vatRegistered: true,
      stampDutyEnabled: true, stampDutyAmount: "1", withholdingBase: "ttc", withholdingThreshold: "0",
    });
    const checks = await checkData(db);
    expect(checks.find((c) => c.id === "company")!.status).toBe("ok");
    const teif = checks.find((c) => c.id === "teif")!;
    expect(teif.status).toBe("info");
    expect(teif.detail).toContain("À FOURNIR PAR TTN");
  });
});

describe("aucun secret dans le dépôt", () => {
  const SKIP = new Set(["node_modules", ".next", ".git", ".data", "out", "drizzle"]);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|mjs|js|json|md|yml|yaml|sql|html|css|example)$/.test(name) || name === "Dockerfile") files.push(path);
    }
  };
  walk(process.cwd());

  it("ne contient ni clé privée, ni certificat, ni jeton d'accès, ni mot de passe SMTP", () => {
    const patterns: [string, RegExp][] = [
      ["clé privée", /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
      ["clé d'accès AWS", /\bAKIA[0-9A-Z]{16}\b/],
      ["jeton GitHub", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
      ["mot de passe SMTP", /^\s*SMTP_PASS=\S+/m],
      ["secret des tâches", /^\s*CRON_SECRET=\S{8,}/m],
    ];
    const found: string[] = [];
    for (const f of files) {
      if (f.endsWith("security.test.ts")) continue; // ce fichier contient les motifs eux-mêmes
      const text = readFileSync(f, "utf8");
      for (const [label, re] of patterns) if (re.test(text)) found.push(`${f} : ${label}`);
    }
    expect(found).toEqual([]);
  });

  it("n'embarque aucun fichier de certificat ou de clé", () => {
    const bad: string[] = [];
    const scan = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) scan(path);
        else if (/\.(p12|pfx|pem|key|jks|crt)$/i.test(name)) bad.push(path);
      }
    };
    scan(process.cwd());
    expect(bad).toEqual([]);
  });
});
