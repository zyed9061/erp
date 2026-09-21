import { and, asc, eq } from "drizzle-orm";
import { auditLog } from "@/db/schema";
import type { Database } from "@/db";
import type { Db } from "@/db/types";

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

/** Historique chronologique des opérations enregistrées sur un document (création, validation, avoir, envoi, export…). */
export async function entityHistory(db: Db, entity: string, entityId: string) {
  return db
    .select({ id: auditLog.id, at: auditLog.occurredAt, userEmail: auditLog.userEmail, action: auditLog.action })
    .from(auditLog)
    .where(and(eq(auditLog.entity, entity), eq(auditLog.entityId, entityId)))
    .orderBy(asc(auditLog.occurredAt), asc(auditLog.id));
}

const ACTION_LABELS: Record<string, string> = {
  "invoice.create": "Facture créée (brouillon)", "invoice.update": "Brouillon modifié", "invoice.delete": "Brouillon supprimé",
  "invoice.validate": "Facture validée et numérotée",
  "credit_note.create": "Avoir créé (brouillon)", "credit_note.update": "Brouillon d'avoir modifié", "credit_note.delete": "Brouillon d'avoir supprimé",
  "credit_note.validate": "Avoir validé et numéroté",
  "deposit_invoice.create": "Facture d'acompte créée (brouillon)", "deposit_invoice.update": "Brouillon d'acompte modifié",
  "deposit_invoice.delete": "Brouillon d'acompte supprimé", "deposit_invoice.validate": "Facture d'acompte validée et numérotée",
  "email.sent": "Envoyée par e-mail", "email.failed": "Échec d'envoi par e-mail",
  "einvoice.prepare": "Fichier TEIF préparé (non signé, non transmis)",
  "einvoice.submit": "Envoi à la TTN (SIMULATION) : signé et envoyé",
};

/** Libellé lisible d'une action d'audit ; le code brut est conservé pour les actions inconnues. */
export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action;
