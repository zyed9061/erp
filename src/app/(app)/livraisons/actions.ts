"use server";

import { z } from "zod";
import { db } from "@/db";
import { getClientIp, requirePermission } from "@/lib/auth/session";
import { flash, messageOf, str } from "@/lib/action-utils";
import {
  cancelDeliveryNote, createDraftDeliveryNote, createInvoiceFromDeliveryNotes, deleteDraftDeliveryNote,
  updateDraftDeliveryNote, validateDeliveryNote, type DeliveryInput,
} from "@/lib/delivery";
import { ServiceError } from "@/lib/errors";

async function actorOf(permission: "delivery:write" | "delivery:validate" | "invoices:write") {
  const user = await requirePermission(permission);
  return { id: user.id, email: user.email, ip: await getClientIp() };
}

const uuid = z.string().uuid();

function parsePayload(raw: string): DeliveryInput {
  try {
    return JSON.parse(raw) as DeliveryInput;
  } catch {
    throw new ServiceError("Formulaire invalide");
  }
}

export async function saveDeliveryAction(formData: FormData) {
  const actor = await actorOf("delivery:write");
  const idRaw = str(formData.get("id"));
  const back = idRaw ? `/livraisons/${idRaw}` : "/livraisons/nouveau";
  let id: string;
  try {
    const input = parsePayload(str(formData.get("payload")));
    if (idRaw) {
      const version = Number.parseInt(str(formData.get("version")), 10);
      id = (await updateDraftDeliveryNote(db, actor, uuid.parse(idRaw), input, Number.isFinite(version) ? version : undefined)).id;
    } else {
      id = (await createDraftDeliveryNote(db, actor, input)).id;
    }
  } catch (e) {
    flash(back, "error", messageOf(e));
  }
  flash(`/livraisons/${id}`, "ok", "Brouillon enregistré");
}

export async function validateDeliveryAction(formData: FormData) {
  const actor = await actorOf("delivery:validate");
  const id = uuid.parse(formData.get("id"));
  let number: string;
  try {
    number = (await validateDeliveryNote(db, actor, id)).number ?? "";
  } catch (e) {
    flash(`/livraisons/${id}`, "error", messageOf(e));
  }
  flash(`/livraisons/${id}`, "ok", `Bon validé : ${number} (stock mis à jour)`);
}

export async function deleteDeliveryAction(formData: FormData) {
  const actor = await actorOf("delivery:write");
  const id = uuid.parse(formData.get("id"));
  try {
    await deleteDraftDeliveryNote(db, actor, id);
  } catch (e) {
    flash(`/livraisons/${id}`, "error", messageOf(e));
  }
  flash("/livraisons", "ok", "Brouillon supprimé");
}

export async function cancelDeliveryAction(formData: FormData) {
  const actor = await actorOf("delivery:validate");
  const id = uuid.parse(formData.get("id"));
  try {
    await cancelDeliveryNote(db, actor, id, str(formData.get("reason")));
  } catch (e) {
    flash(`/livraisons/${id}`, "error", messageOf(e));
  }
  flash(`/livraisons/${id}`, "ok", "Bon annulé, marchandise remise en stock");
}

/** Facture les bons cochés dans la liste (même client). */
export async function invoiceDeliveriesAction(formData: FormData) {
  const actor = await actorOf("invoices:write");
  let invoiceId: string;
  try {
    const noteIds = formData.getAll("noteId").filter((v): v is string => typeof v === "string");
    invoiceId = (await createInvoiceFromDeliveryNotes(db, actor, { noteIds })).id;
  } catch (e) {
    flash("/livraisons?toInvoice=1", "error", messageOf(e));
  }
  flash(`/factures/${invoiceId}`, "ok", "Facture créée en brouillon depuis les bons de livraison : vérifiez puis validez");
}
