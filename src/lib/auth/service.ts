import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "@/db/types";
import { sessions, users, type User } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hashPassword, sha256Hex, verifyPassword } from "./password";

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 h
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

// Hash factice : on vérifie toujours un mot de passe, même si l'e-mail est inconnu,
// pour ne pas révéler l'existence d'un compte par le temps de réponse.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("dummy-password-for-timing"));

export type LoginResult =
  | { ok: true; user: User; token: string; expiresAt: Date }
  | { ok: false; reason: "invalid" | "locked" | "inactive" };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function authenticate(
  db: Db,
  input: { email: string; password: string; ip?: string | null; userAgent?: string | null },
  now: Date = new Date(),
): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    await verifyPassword(input.password, await getDummyHash());
    await audit(db, { action: "login.failed", entity: "user", userEmail: email, ip: input.ip });
    return { ok: false, reason: "invalid" };
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    await audit(db, {
      action: "login.blocked", entity: "user", entityId: user.id, userEmail: email, ip: input.ip,
    });
    return { ok: false, reason: "locked" };
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedAttempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await db
      .update(users)
      .set({
        failedAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(now.getTime() + LOCK_DURATION_MS) : user.lockedUntil,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));
    await audit(db, {
      action: lock ? "login.locked" : "login.failed",
      entity: "user", entityId: user.id, userEmail: email, ip: input.ip,
    });
    return { ok: false, reason: "invalid" };
  }

  if (!user.isActive) {
    await audit(db, {
      action: "login.inactive", entity: "user", entityId: user.id, userEmail: email, ip: input.ip,
    });
    return { ok: false, reason: "inactive" };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      userId: user.id,
      tokenHash: sha256Hex(token),
      expiresAt,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
    await tx
      .update(users)
      .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now })
      .where(eq(users.id, user.id));
    await audit(tx, {
      userId: user.id, userEmail: user.email, action: "login.success",
      entity: "user", entityId: user.id, ip: input.ip,
    });
  });
  return { ok: true, user, token, expiresAt };
}

/** Retourne l'utilisateur actif associé à un jeton de session valide, sinon null. */
export async function resolveSession(db: Db, token: string, now: Date = new Date()) {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256Hex(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  return row && row.user.isActive ? row.user : null;
}

export async function revokeSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256Hex(token)));
}
