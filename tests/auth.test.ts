import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { can } from "@/lib/auth/permissions";
import {
  LOCK_DURATION_MS, MAX_FAILED_ATTEMPTS, authenticate, resolveSession, revokeSession,
} from "@/lib/auth/service";
import { UserError, createUser, updateUser } from "@/lib/users";
import { createTestDb } from "./helpers";

let db: Db;
let close: () => Promise<void>;
const PASSWORD = "Correct-Horse-42";

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("mots de passe", () => {
  it("hache avec un sel et vérifie correctement", async () => {
    const [h1, h2] = await Promise.all([hashPassword("abcdefghij"), hashPassword("abcdefghij")]);
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("abcdefghij", h1)).toBe(true);
    expect(await verifyPassword("abcdefghijk", h1)).toBe(false);
    expect(await verifyPassword("abcdefghij", "format-invalide")).toBe(false);
  });
});

describe("permissions", () => {
  it("réserve la gestion des utilisateurs à l'administrateur", () => {
    expect(can("admin", "users:manage")).toBe(true);
    expect(can("comptable", "users:manage")).toBe(false);
  });
  it("interdit l'écriture au rôle lecture seule", () => {
    expect(can("lecture_seule", "invoices:read")).toBe(true);
    expect(can("lecture_seule", "invoices:write")).toBe(false);
    expect(can("commercial", "invoices:validate")).toBe(false);
  });
});

describe("authentification", () => {
  it("ouvre une session, résout le jeton, puis la révoque", async () => {
    await createUser(db, null, { email: "Ali@Example.tn", name: "Ali", role: "comptable", password: PASSWORD });
    const res = await authenticate(db, { email: " ali@example.tn ", password: PASSWORD, ip: "1.2.3.4" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const [row] = await db.select().from(sessions).where(eq(sessions.userId, res.user.id));
    expect(row?.tokenHash).not.toBe(res.token); // le jeton brut n'est pas stocké

    expect((await resolveSession(db, res.token))?.email).toBe("ali@example.tn");
    expect(await resolveSession(db, res.token, new Date(res.expiresAt.getTime() + 1))).toBeNull();
    await revokeSession(db, res.token);
    expect(await resolveSession(db, res.token)).toBeNull();
  });

  it("refuse un mauvais mot de passe ou un e-mail inconnu avec le même résultat", async () => {
    const bad = await authenticate(db, { email: "ali@example.tn", password: "faux-mot-de-passe" });
    const unknown = await authenticate(db, { email: "inconnu@example.tn", password: "faux-mot-de-passe" });
    expect(bad).toEqual({ ok: false, reason: "invalid" });
    expect(unknown).toEqual({ ok: false, reason: "invalid" });
  });

  it("verrouille le compte après trop d'échecs, puis le libère", async () => {
    await createUser(db, null, { email: "lock@example.tn", name: "Lock", role: "commercial", password: PASSWORD });
    const now = new Date();
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await authenticate(db, { email: "lock@example.tn", password: "mauvais-mdp-123" }, now);
    }
    // Même le bon mot de passe est refusé pendant le verrouillage.
    expect(await authenticate(db, { email: "lock@example.tn", password: PASSWORD }, now))
      .toEqual({ ok: false, reason: "locked" });
    const later = new Date(now.getTime() + LOCK_DURATION_MS + 1000);
    expect((await authenticate(db, { email: "lock@example.tn", password: PASSWORD }, later)).ok).toBe(true);
  });

  it("refuse un compte désactivé et coupe ses sessions", async () => {
    const admin = await createUser(db, null, { email: "boss@example.tn", name: "Boss", role: "admin", password: PASSWORD });
    const user = await createUser(db, null, { email: "off@example.tn", name: "Off", role: "commercial", password: PASSWORD });
    const login = await authenticate(db, { email: "off@example.tn", password: PASSWORD });
    expect(login.ok).toBe(true);

    await updateUser(db, { id: admin.id, email: admin.email }, user.id, { isActive: false });
    if (login.ok) expect(await resolveSession(db, login.token)).toBeNull();
    expect(await authenticate(db, { email: "off@example.tn", password: PASSWORD }))
      .toEqual({ ok: false, reason: "inactive" });
  });
});

describe("gestion des utilisateurs", () => {
  it("refuse un e-mail en double (insensible à la casse) et un mot de passe trop court", async () => {
    await createUser(db, null, { email: "dup@example.tn", name: "Dup", role: "commercial", password: PASSWORD });
    await expect(
      createUser(db, null, { email: "DUP@example.tn", name: "Dup2", role: "commercial", password: PASSWORD }),
    ).rejects.toBeInstanceOf(UserError);
    await expect(
      createUser(db, null, { email: "short@example.tn", name: "S", role: "commercial", password: "court" }),
    ).rejects.toThrow();
  });

  it("ne laisse jamais zéro administrateur actif", async () => {
    // Base isolée : un seul administrateur.
    const solo = await createTestDb();
    try {
      const admin = await createUser(solo.db, null, { email: "solo@example.tn", name: "Solo", role: "admin", password: PASSWORD });
      const actor = { id: admin.id, email: admin.email };
      await expect(updateUser(solo.db, actor, admin.id, { role: "comptable" })).rejects.toBeInstanceOf(UserError);
      await expect(updateUser(solo.db, actor, admin.id, { isActive: false })).rejects.toBeInstanceOf(UserError);

      const second = await createUser(solo.db, actor, { email: "second@example.tn", name: "Second", role: "admin", password: PASSWORD });
      await updateUser(solo.db, actor, second.id, { role: "comptable" }); // autorisé : il reste "solo"
      const [still] = await solo.db.select().from(users).where(eq(users.id, admin.id));
      expect(still?.role).toBe("admin");
    } finally {
      await solo.close();
    }
  });

  it("journalise les modifications sans jamais copier le hash du mot de passe", async () => {
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "user.create"));
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain("scrypt$");
  });
});
