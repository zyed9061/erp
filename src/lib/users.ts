import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/types";
import { ROLES, sessions, users, type Role, type User } from "@/db/schema";
import { audit, redact } from "@/lib/audit";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/auth/password";
import { normalizeEmail } from "@/lib/auth/service";
import { ServiceError } from "@/lib/errors";

export class UserError extends ServiceError {}

type Actor = { id: string; email: string; ip?: string | null };

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`)
  .max(200);

export const createUserSchema = z.object({
  email: z.string().trim().email("E-mail invalide").max(200),
  name: z.string().trim().min(1, "Nom requis").max(120),
  role: z.enum(ROLES),
  password: passwordSchema,
});

export async function listUsers(db: Db) {
  const rows = await db.select().from(users).orderBy(asc(users.name));
  return rows.map(({ passwordHash: _p, ...u }) => u);
}

export async function createUser(db: Db, actor: Actor | null, input: z.input<typeof createUserSchema>) {
  const data = createUserSchema.parse(input);
  const email = normalizeEmail(data.email);
  const passwordHash = await hashPassword(data.password);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing) throw new UserError("Un utilisateur avec cet e-mail existe déjà");
    const [created] = await tx
      .insert(users)
      .values({ email, name: data.name, role: data.role, passwordHash })
      .returning();
    if (!created) throw new Error("Insertion utilisateur échouée");
    await audit(tx, {
      userId: actor?.id, userEmail: actor?.email, ip: actor?.ip,
      action: "user.create", entity: "user", entityId: created.id, after: redact(created),
    });
    return created;
  });
}

/** Compte les administrateurs actifs hors `exceptId`, pour ne jamais en laisser zéro. */
async function otherActiveAdmins(tx: Pick<Db, "select">, exceptId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, exceptId)));
  return row?.n ?? 0;
}

export async function updateUser(
  db: Db,
  actor: Actor,
  id: string,
  patch: { name?: string; role?: Role; isActive?: boolean; password?: string },
) {
  const passwordHash = patch.password
    ? await hashPassword(passwordSchema.parse(patch.password))
    : undefined;

  return db.transaction(async (tx) => {
    // Verrou de ligne : évite deux modifications concurrentes du même compte.
    const [before] = await tx.select().from(users).where(eq(users.id, id)).for("update");
    if (!before) throw new UserError("Utilisateur introuvable");

    const nextRole = patch.role ?? before.role;
    const nextActive = patch.isActive ?? before.isActive;
    const losesAdmin = before.role === "admin" && before.isActive && (nextRole !== "admin" || !nextActive);
    if (losesAdmin && (await otherActiveAdmins(tx, id)) === 0) {
      throw new UserError("Il doit rester au moins un administrateur actif");
    }

    const [after] = await tx
      .update(users)
      .set({
        name: patch.name?.trim() || before.name,
        role: nextRole,
        isActive: nextActive,
        ...(passwordHash ? { passwordHash, failedAttempts: 0, lockedUntil: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    if (!after) throw new Error("Mise à jour utilisateur échouée");

    // Un compte désactivé ou dont le mot de passe change perd toutes ses sessions.
    if (!nextActive || passwordHash) await tx.delete(sessions).where(eq(sessions.userId, id));

    await audit(tx, {
      userId: actor.id, userEmail: actor.email, ip: actor.ip,
      action: passwordHash ? "user.update+password" : "user.update",
      entity: "user", entityId: id, before: redact(before), after: redact(after),
    });
    return after as User;
  });
}
