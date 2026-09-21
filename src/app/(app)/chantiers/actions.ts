"use server";

import { z } from "zod";
import { db } from "@/db";
import { PROJECT_STATUSES } from "@/db/schema";
import { getClientIp, requirePermission } from "@/lib/auth/session";
import { flash, messageOf, str } from "@/lib/action-utils";
import { ServiceError } from "@/lib/errors";
import {
  createProject, createSituation, releaseHoldback, setProjectStatus, updateProject, updateProjectMeta, type ProjectInput,
} from "@/lib/projects";

async function actorOf() {
  const user = await requirePermission("projects:write");
  return { id: user.id, email: user.email, ip: await getClientIp() };
}

const uuid = z.string().uuid();

function parsePayload(raw: string): ProjectInput {
  try {
    return JSON.parse(raw) as ProjectInput;
  } catch {
    throw new ServiceError("Formulaire invalide");
  }
}

export async function saveProjectAction(formData: FormData) {
  const actor = await actorOf();
  const idRaw = str(formData.get("id"));
  const back = idRaw ? `/chantiers/${idRaw}` : "/chantiers/nouveau";
  let id: string;
  try {
    const input = parsePayload(str(formData.get("payload")));
    id = idRaw ? (await updateProject(db, actor, uuid.parse(idRaw), input)).id : (await createProject(db, actor, input)).id;
  } catch (e) {
    flash(back, "error", messageOf(e));
  }
  flash(`/chantiers/${id}`, "ok", "Chantier enregistré");
}

export async function updateProjectMetaAction(formData: FormData) {
  const actor = await actorOf();
  const id = uuid.parse(formData.get("id"));
  try {
    await updateProjectMeta(db, actor, id, {
      name: str(formData.get("name")), description: str(formData.get("description")),
      holdbackPercent: str(formData.get("holdbackPercent")) || "0",
    });
  } catch (e) {
    flash(`/chantiers/${id}`, "error", messageOf(e));
  }
  flash(`/chantiers/${id}`, "ok", "Chantier mis à jour");
}

/** Champs `pct_<idPoste>` (avancement cumulé) -> situation ; les champs vides sont ignorés. */
export async function createSituationAction(formData: FormData) {
  const actor = await actorOf();
  const id = uuid.parse(formData.get("id"));
  let invoiceId: string;
  try {
    const progress: { projectLineId: string; cumulativePercent: string }[] = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("pct_") || typeof value !== "string" || value.trim() === "") continue;
      progress.push({ projectLineId: uuid.parse(key.slice(4)), cumulativePercent: value });
    }
    invoiceId = (await createSituation(db, actor, id, { issueDate: str(formData.get("issueDate")) || undefined, progress })).invoice.id;
  } catch (e) {
    flash(`/chantiers/${id}`, "error", messageOf(e));
  }
  flash(`/factures/${invoiceId}`, "ok", "Situation créée en brouillon de facture : vérifiez puis validez");
}

export async function releaseHoldbackAction(formData: FormData) {
  const actor = await actorOf();
  const id = uuid.parse(formData.get("id"));
  try {
    await releaseHoldback(db, actor, id, {
      amount: str(formData.get("amount")), releasedOn: str(formData.get("releasedOn")) || undefined,
      reference: str(formData.get("reference")), notes: str(formData.get("notes")),
    });
  } catch (e) {
    flash(`/chantiers/${id}`, "error", messageOf(e));
  }
  flash(`/chantiers/${id}`, "ok", "Libération de retenue enregistrée");
}

export async function setProjectStatusAction(formData: FormData) {
  const actor = await actorOf();
  const id = uuid.parse(formData.get("id"));
  try {
    await setProjectStatus(db, actor, id, z.enum(PROJECT_STATUSES).parse(formData.get("status")));
  } catch (e) {
    flash(`/chantiers/${id}`, "error", messageOf(e));
  }
  flash(`/chantiers/${id}`, "ok", "Statut du chantier mis à jour");
}
