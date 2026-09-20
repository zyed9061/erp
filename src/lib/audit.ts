import { auditLog } from "@/db/schema";
import type { Database } from "@/db";

type Executor = Pick<Database, "insert">;

export type AuditInput = {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

/**
 * Écrit dans le journal d'audit. Passer la transaction en cours (`tx`) pour que
 * l'entrée soit validée ou annulée avec la modification qu'elle décrit.
 */
export async function audit(executor: Executor, entry: AuditInput) {
  await executor.insert(auditLog).values({
    userId: entry.userId ?? null,
    userEmail: entry.userEmail ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
  });
}

/** Retire les champs sensibles avant de les copier dans le journal. */
export function redact<T extends Record<string, unknown>>(row: T) {
  const { passwordHash: _p, ...rest } = row as Record<string, unknown>;
  return rest;
}
