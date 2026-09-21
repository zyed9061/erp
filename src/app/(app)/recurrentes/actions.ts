"use server";

import { z } from "zod";
import { db } from "@/db";
import { getClientIp, requirePermission } from "@/lib/auth/session";
import { flash, messageOf, str } from "@/lib/action-utils";
import { ServiceError } from "@/lib/errors";
import {
  createRecurringTemplate, deleteRecurringTemplate, runRecurring, setRecurringStatus, updateRecurringTemplate,
  type RecurringInput,
} from "@/lib/invoicing/recurring";
import { formBool } from "@/lib/validation";

async function actorOf() {
  const user = await requirePermission("recurring:write");
  return { id: user.id, email: user.email, ip: await getClientIp() };
}

const uuid = z.string().uuid();

/** L'éditeur de lignes envoie la première échéance dans `issueDate` ; le reste vient des champs du modèle. */
function inputFrom(formData: FormData): RecurringInput {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(str(formData.get("payload"))) as Record<string, unknown>;
  } catch {
    throw new ServiceError("Formulaire invalide");
  }
  const { issueDate, dueDate: _due, ...rest } = payload;
  return {
    ...rest,
    startDate: issueDate,
    name: str(formData.get("name")),
    frequency: str(formData.get("frequency")),
    endDate: str(formData.get("endDate")),
    autoValidate: formBool(formData.get("autoValidate")),
    autoSend: formBool(formData.get("autoSend")),
  } as RecurringInput;
}

export async function saveRecurringAction(formData: FormData) {
  const actor = await actorOf();
  const idRaw = str(formData.get("id"));
  const back = idRaw ? `/recurrentes/${idRaw}` : "/recurrentes/nouveau";
  let id: string;
  try {
    const input = inputFrom(formData);
    id = idRaw ? (await updateRecurringTemplate(db, actor, uuid.parse(idRaw), input)).id : (await createRecurringTemplate(db, actor, input)).id;
  } catch (e) {
    flash(back, "error", messageOf(e));
  }
  flash(`/recurrentes/${id}`, "ok", "Modèle enregistré");
}

export async function setRecurringStatusAction(formData: FormData) {
  const actor = await actorOf();
  const id = uuid.parse(formData.get("id"));
  try {
    await setRecurringStatus(db, actor, id, z.enum(["active", "paused", "ended"]).parse(formData.get("status")));
  } catch (e) {
    flash(`/recurrentes/${id}`, "error", messageOf(e));
  }
  flash(`/recurrentes/${id}`, "ok", "Statut du modèle mis à jour");
}

export async function deleteRecurringAction(formData: FormData) {
  const actor = await actorOf();
  const id = uuid.parse(formData.get("id"));
  try {
    await deleteRecurringTemplate(db, actor, id);
  } catch (e) {
    flash(`/recurrentes/${id}`, "error", messageOf(e));
  }
  flash("/recurrentes", "ok", "Modèle supprimé");
}

/** Lance les échéances dues (tous les modèles, ou un seul). Idempotent. */
export async function runRecurringAction(formData: FormData) {
  await actorOf();
  const templateId = str(formData.get("templateId"));
  const back = templateId ? `/recurrentes/${templateId}` : "/recurrentes";
  let generated = 0;
  let failed = 0;
  try {
    const s = await runRecurring(db, { templateId: templateId ? uuid.parse(templateId) : undefined });
    generated = s.generated.length;
    failed = s.failed.length;
    if (failed > 0) throw new ServiceError(`${generated} facture(s) générée(s), ${failed} en échec : ${s.failed[0]!.error}`);
  } catch (e) {
    flash(back, "error", messageOf(e));
  }
  flash(back, "ok", generated === 0 ? "Aucune échéance due" : `${generated} facture(s) générée(s)`);
}
