"use server";

import { z } from "zod";
import { db } from "@/db";
import { getClientIp, requirePermission } from "@/lib/auth/session";
import { flash, messageOf, str } from "@/lib/action-utils";
import { ServiceError } from "@/lib/errors";
import { sendQuoteEmail } from "@/lib/mail/documents";
import {
  createDepositInvoiceDraft, createDraftQuote, createInvoiceFromQuote, decideQuote, deleteDraftQuote,
  sendQuote, updateDraftQuote, type QuoteInput,
} from "@/lib/invoicing/quotes";

async function actorOf(permission: "quotes:write" | "invoices:write") {
  const user = await requirePermission(permission);
  return { id: user.id, email: user.email, ip: await getClientIp() };
}

const uuid = z.string().uuid();

/** L'éditeur partagé envoie la validité du devis dans le champ `dueDate`. */
function parsePayload(raw: string): QuoteInput {
  try {
    const { dueDate, ...rest } = JSON.parse(raw) as Record<string, unknown>;
    return { ...rest, validUntil: dueDate ?? "" } as QuoteInput;
  } catch {
    throw new ServiceError("Formulaire invalide");
  }
}

export async function saveQuoteAction(formData: FormData) {
  const actor = await actorOf("quotes:write");
  const idRaw = str(formData.get("id"));
  const back = idRaw ? `/devis/${idRaw}` : "/devis/nouveau";
  let id: string;
  try {
    const input = parsePayload(str(formData.get("payload")));
    if (idRaw) {
      const version = Number.parseInt(str(formData.get("version")), 10);
      id = (await updateDraftQuote(db, actor, uuid.parse(idRaw), input, Number.isFinite(version) ? version : undefined)).id;
    } else {
      id = (await createDraftQuote(db, actor, input)).id;
    }
  } catch (e) {
    flash(back, "error", messageOf(e));
  }
  flash(`/devis/${id}`, "ok", "Brouillon enregistré");
}

export async function sendQuoteAction(formData: FormData) {
  const actor = await actorOf("quotes:write");
  const id = uuid.parse(formData.get("id"));
  let number: string;
  try {
    number = (await sendQuote(db, actor, id)).number ?? "";
  } catch (e) {
    flash(`/devis/${id}`, "error", messageOf(e));
  }
  flash(`/devis/${id}`, "ok", `Devis envoyé : ${number}`);
}

export async function decideQuoteAction(formData: FormData) {
  const actor = await actorOf("quotes:write");
  const id = uuid.parse(formData.get("id"));
  const decision = z.enum(["accepted", "declined"]).parse(formData.get("decision"));
  try {
    await decideQuote(db, actor, id, decision);
  } catch (e) {
    flash(`/devis/${id}`, "error", messageOf(e));
  }
  flash(`/devis/${id}`, "ok", decision === "accepted" ? "Devis accepté" : "Devis refusé");
}

export async function deleteQuoteAction(formData: FormData) {
  const actor = await actorOf("quotes:write");
  const id = uuid.parse(formData.get("id"));
  try {
    await deleteDraftQuote(db, actor, id);
  } catch (e) {
    flash(`/devis/${id}`, "error", messageOf(e));
  }
  flash("/devis", "ok", "Brouillon supprimé");
}

export async function createDepositAction(formData: FormData) {
  const actor = await actorOf("invoices:write");
  const id = uuid.parse(formData.get("id"));
  let invoiceId: string;
  try {
    invoiceId = (await createDepositInvoiceDraft(db, actor, id, { percent: str(formData.get("percent")) })).id;
  } catch (e) {
    flash(`/devis/${id}`, "error", messageOf(e));
  }
  flash(`/factures/${invoiceId}`, "ok", "Facture d'acompte créée en brouillon : vérifiez puis validez");
}

export async function createFinalInvoiceAction(formData: FormData) {
  const actor = await actorOf("invoices:write");
  const id = uuid.parse(formData.get("id"));
  let invoiceId: string;
  try {
    invoiceId = (await createInvoiceFromQuote(db, actor, id)).id;
  } catch (e) {
    flash(`/devis/${id}`, "error", messageOf(e));
  }
  flash(`/factures/${invoiceId}`, "ok", "Facture finale créée en brouillon (acomptes déduits) : vérifiez puis validez");
}

export async function sendQuoteEmailAction(formData: FormData) {
  const actor = await actorOf("quotes:write");
  const id = uuid.parse(formData.get("id"));
  try {
    const { log } = await sendQuoteEmail(db, actor, id, {
      to: str(formData.get("to")) || undefined,
      message: str(formData.get("message")),
    });
    flash(`/devis/${id}`, "ok", `E-mail envoyé à ${log.toEmail}`);
  } catch (e) {
    flash(`/devis/${id}`, "error", messageOf(e));
  }
}
