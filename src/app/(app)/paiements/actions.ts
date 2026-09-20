"use server";

import { z } from "zod";
import { db } from "@/db";
import { getClientIp, requirePermission } from "@/lib/auth/session";
import { flash, messageOf, str } from "@/lib/action-utils";
import { ServiceError } from "@/lib/errors";
import {
  addWithholdingCertificate, allocatePayment, recordPayment, voidPayment, type AllocationInput,
} from "@/lib/invoicing/payments";

async function actorOf() {
  const user = await requirePermission("payments:write");
  return { id: user.id, email: user.email, ip: await getClientIp() };
}

const uuid = z.string().uuid();

/** Champs `alloc_<idFacture>` du formulaire -> imputations (les champs vides sont ignorés). */
function allocationsOf(formData: FormData): AllocationInput[] {
  const out: AllocationInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("alloc_") || typeof value !== "string" || value.trim() === "") continue;
    out.push({ invoiceId: uuid.parse(key.slice("alloc_".length)), amount: value });
  }
  return out;
}

/** Redirection de retour : uniquement vers nos propres pages (jamais une URL saisie librement). */
function safeNext(raw: string, fallback: string) {
  return /^\/(paiements|factures)(\/[0-9a-f-]{36})?$/.test(raw) ? raw : fallback;
}

export async function recordPaymentAction(formData: FormData) {
  const actor = await actorOf();
  const next = safeNext(str(formData.get("next")), "/paiements");
  const customerId = str(formData.get("customerId"));
  let id: string;
  try {
    const allocations = allocationsOf(formData);
    // Encaissement rapide depuis une facture : le montant du paiement est celui de l'imputation unique.
    const amount = str(formData.get("amount")) || (allocations.length === 1 ? allocations[0]!.amount : "");
    id = (await recordPayment(db, actor, {
      customerId,
      paymentDate: str(formData.get("paymentDate")),
      amount,
      method: str(formData.get("method")) as "virement",
      reference: str(formData.get("reference")),
      notes: str(formData.get("notes")),
      allocations,
    })).id;
  } catch (e) {
    flash(next === "/paiements" ? `/paiements/nouveau?client=${encodeURIComponent(customerId)}` : next, "error", messageOf(e));
  }
  flash(next === "/paiements" ? `/paiements/${id}` : next, "ok", "Paiement enregistré");
}

export async function allocatePaymentAction(formData: FormData) {
  const actor = await actorOf();
  const id = uuid.parse(formData.get("id"));
  try {
    const allocations = allocationsOf(formData);
    if (allocations.length === 0) throw new ServiceError("Indiquez au moins un montant à imputer");
    await allocatePayment(db, actor, id, allocations);
  } catch (e) {
    flash(`/paiements/${id}`, "error", messageOf(e));
  }
  flash(`/paiements/${id}`, "ok", "Imputation enregistrée");
}

export async function voidPaymentAction(formData: FormData) {
  const actor = await actorOf();
  const id = uuid.parse(formData.get("id"));
  try {
    await voidPayment(db, actor, id, str(formData.get("reason")));
  } catch (e) {
    flash(`/paiements/${id}`, "error", messageOf(e));
  }
  flash(`/paiements/${id}`, "ok", "Paiement annulé");
}

export async function addCertificateAction(formData: FormData) {
  const actor = await actorOf();
  const invoiceId = uuid.parse(formData.get("invoiceId"));
  try {
    await addWithholdingCertificate(db, actor, invoiceId, {
      number: str(formData.get("number")),
      certificateDate: str(formData.get("certificateDate")),
      amount: str(formData.get("amount")),
    });
  } catch (e) {
    flash(`/factures/${invoiceId}`, "error", messageOf(e));
  }
  flash(`/factures/${invoiceId}`, "ok", "Certificat enregistré");
}
