"use server";

import { z } from "zod";
import { db } from "@/db";
import { getClientIp, requirePermission } from "@/lib/auth/session";
import { flash, messageOf, str } from "@/lib/action-utils";
import { ServiceError } from "@/lib/errors";
import { prepareEinvoice } from "@/lib/einvoice/service";
import { submitToTtn } from "@/lib/einvoice/submission";
import { sendInvoiceEmail } from "@/lib/mail/documents";
import { isSimulatedMail } from "@/lib/mail/transport";
import {
  createCreditNoteDraft, createDraftInvoice, deleteDraft, updateDraftInvoice, validateDocument,
  type InvoiceInput,
} from "@/lib/invoicing/invoices";

async function actorOf(permission: "invoices:write" | "invoices:validate") {
  const user = await requirePermission(permission);
  return { id: user.id, email: user.email, ip: await getClientIp() };
}

const uuid = z.string().uuid();

function parsePayload(raw: string): InvoiceInput {
  try {
    return JSON.parse(raw) as InvoiceInput;
  } catch {
    throw new ServiceError("Formulaire invalide");
  }
}

export async function saveInvoiceAction(formData: FormData) {
  const actor = await actorOf("invoices:write");
  const idRaw = str(formData.get("id"));
  const back = idRaw ? `/factures/${idRaw}` : "/factures/nouveau";
  let id: string;
  try {
    const input = parsePayload(str(formData.get("payload")));
    if (idRaw) {
      const version = Number.parseInt(str(formData.get("version")), 10);
      id = (await updateDraftInvoice(db, actor, uuid.parse(idRaw), input, Number.isFinite(version) ? version : undefined)).id;
    } else {
      id = (await createDraftInvoice(db, actor, input)).id;
    }
  } catch (e) {
    flash(back, "error", messageOf(e));
  }
  flash(`/factures/${id}`, "ok", "Brouillon enregistré");
}

export async function validateInvoiceAction(formData: FormData) {
  const actor = await actorOf("invoices:validate");
  const id = uuid.parse(formData.get("id"));
  let number: string;
  try {
    number = (await validateDocument(db, actor, id)).number ?? "";
  } catch (e) {
    flash(`/factures/${id}`, "error", messageOf(e));
  }
  flash(`/factures/${id}`, "ok", `Document validé : ${number}`);
}

export async function deleteDraftAction(formData: FormData) {
  const actor = await actorOf("invoices:write");
  const id = uuid.parse(formData.get("id"));
  try {
    await deleteDraft(db, actor, id);
  } catch (e) {
    flash(`/factures/${id}`, "error", messageOf(e));
  }
  flash("/factures", "ok", "Brouillon supprimé");
}

export async function createCreditNoteAction(formData: FormData) {
  const actor = await actorOf("invoices:write");
  const id = uuid.parse(formData.get("id"));
  let creditId: string;
  try {
    creditId = (await createCreditNoteDraft(db, actor, id, { reason: str(formData.get("reason")) })).id;
  } catch (e) {
    flash(`/factures/${id}`, "error", messageOf(e));
  }
  flash(`/factures/${creditId}`, "ok", "Avoir créé en brouillon : ajustez les lignes puis validez");
}

export async function sendInvoiceEmailAction(formData: FormData) {
  const actor = await actorOf("invoices:write");
  const id = uuid.parse(formData.get("id"));
  try {
    const { log } = await sendInvoiceEmail(db, actor, id, {
      to: str(formData.get("to")) || undefined,
      message: str(formData.get("message")),
    });
    flash(`/factures/${id}`, "ok", isSimulatedMail() ? `Mode TEST : e-mail à ${log.toEmail} simulé (rien n'est parti, SMTP non configuré)` : `E-mail envoyé à ${log.toEmail}`);
  } catch (e) {
    flash(`/factures/${id}`, "error", messageOf(e));
  }
}

/** Prépare (génère et conserve) le fichier TEIF non signé d'une facture validée. */
export async function prepareEinvoiceAction(formData: FormData) {
  const actor = await actorOf("invoices:validate");
  const id = uuid.parse(formData.get("id"));
  try {
    const { created } = await prepareEinvoice(db, actor, id);
    flash(`/factures/${id}`, "ok", created ? "Fichier TEIF préparé (non signé, non transmis)" : "Fichier TEIF déjà préparé");
  } catch (e) {
    flash(`/factures/${id}`, "error", messageOf(e));
  }
}

/** DÉMONSTRATION : signe (simulé) et envoie à la TTN simulée. Sans effet légal. */
export async function submitTtnAction(formData: FormData) {
  const actor = await actorOf("invoices:validate");
  const id = uuid.parse(formData.get("id"));
  try {
    const { submission, created } = await submitToTtn(db, actor, id);
    const msg = !created ? "Déjà accepté par la TTN simulée"
      : submission.status === "accepted" ? `Accepté par la TTN SIMULÉE (référence ${submission.ttnReference})` : submission.message ?? "Rejeté par la TTN simulée";
    flash(`/factures/${id}`, submission.status === "accepted" ? "ok" : "error", msg);
  } catch (e) {
    flash(`/factures/${id}`, "error", messageOf(e));
  }
}
