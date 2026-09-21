"use server";

import { z } from "zod";
import { db } from "@/db";
import { DOC_TYPES } from "@/db/schema";
import { getClientIp, requirePermission } from "@/lib/auth/session";
import { flash, messageOf, str } from "@/lib/action-utils";
import { audit } from "@/lib/audit";
import { updateCompany } from "@/lib/company";
import { getMailTransport } from "@/lib/mail/transport";
import { updateReminderRule } from "@/lib/invoicing/reminders";
import { updateSeriesConfig } from "@/lib/numbering";
import { createPaymentTerm, updatePaymentTerm } from "@/lib/payment-terms";
import { createTaxRate, updateTaxRate } from "@/lib/taxes";
import { formBool } from "@/lib/validation";

async function actorOf() {
  const user = await requirePermission("settings:manage");
  return { id: user.id, email: user.email, ip: await getClientIp() };
}

export async function updateCompanyAction(formData: FormData) {
  const actor = await actorOf();
  try {
    await updateCompany(db, actor, {
      legalName: str(formData.get("legalName")),
      tradeName: str(formData.get("tradeName")),
      matriculeFiscal: str(formData.get("matriculeFiscal")),
      legalForm: str(formData.get("legalForm")),
      capital: str(formData.get("capital")),
      address: str(formData.get("address")),
      city: str(formData.get("city")),
      postalCode: str(formData.get("postalCode")),
      phone: str(formData.get("phone")),
      email: str(formData.get("email")),
      website: str(formData.get("website")),
      bankName: str(formData.get("bankName")),
      rib: str(formData.get("rib")),
      taxRegime: str(formData.get("taxRegime")) as "reel",
      vatRegistered: formBool(formData.get("vatRegistered")),
      stampDutyEnabled: formBool(formData.get("stampDutyEnabled")),
      stampDutyAmount: str(formData.get("stampDutyAmount")),
      withholdingBase: str(formData.get("withholdingBase")) as "ttc",
      withholdingThreshold: str(formData.get("withholdingThreshold")) || "0",
    });
  } catch (e) {
    flash("/parametres", "error", messageOf(e));
  }
  flash("/parametres", "ok", "Société enregistrée");
}

export async function createTaxRateAction(formData: FormData) {
  const actor = await actorOf();
  try {
    await createTaxRate(db, actor, {
      code: str(formData.get("code")),
      label: str(formData.get("label")),
      kind: str(formData.get("kind")) as "tva",
      rate: str(formData.get("rate")),
    });
  } catch (e) {
    flash("/parametres/taxes", "error", messageOf(e));
  }
  flash("/parametres/taxes", "ok", "Taux créé");
}

export async function toggleTaxRateAction(formData: FormData) {
  const actor = await actorOf();
  try {
    await updateTaxRate(db, actor, z.string().uuid().parse(formData.get("id")), {
      isActive: formData.get("isActive") === "true",
    });
  } catch (e) {
    flash("/parametres/taxes", "error", messageOf(e));
  }
  flash("/parametres/taxes", "ok", "Taux mis à jour");
}

export async function createPaymentTermAction(formData: FormData) {
  const actor = await actorOf();
  try {
    await createPaymentTerm(db, actor, {
      label: str(formData.get("label")),
      days: str(formData.get("days")) as unknown as number,
      endOfMonth: formBool(formData.get("endOfMonth")),
    });
  } catch (e) {
    flash("/parametres/conditions", "error", messageOf(e));
  }
  flash("/parametres/conditions", "ok", "Condition créée");
}

export async function updatePaymentTermAction(formData: FormData) {
  const actor = await actorOf();
  const patch =
    formData.get("intent") === "default"
      ? { isDefault: true }
      : { isActive: formData.get("isActive") === "true" };
  try {
    await updatePaymentTerm(db, actor, z.string().uuid().parse(formData.get("id")), patch);
  } catch (e) {
    flash("/parametres/conditions", "error", messageOf(e));
  }
  flash("/parametres/conditions", "ok", "Condition mise à jour");
}

export async function updateSeriesAction(formData: FormData) {
  const actor = await actorOf();
  try {
    await updateSeriesConfig(db, actor, z.enum(DOC_TYPES).parse(formData.get("docType")), {
      prefix: str(formData.get("prefix")),
      padLength: str(formData.get("padLength")) as unknown as number,
      resetYearly: formBool(formData.get("resetYearly")),
    });
  } catch (e) {
    flash("/parametres/numerotation", "error", messageOf(e));
  }
  flash("/parametres/numerotation", "ok", "Numérotation mise à jour");
}

export async function updateReminderRuleAction(formData: FormData) {
  const actor = await actorOf();
  try {
    await updateReminderRule(db, actor, z.coerce.number().int().min(1).max(9).parse(formData.get("level")), {
      daysAfterDue: str(formData.get("daysAfterDue")) as unknown as number,
      subject: str(formData.get("subject")),
      body: str(formData.get("body")),
      isActive: formBool(formData.get("isActive")),
    });
  } catch (e) {
    flash("/parametres/relances", "error", messageOf(e));
  }
  flash("/parametres/relances", "ok", "Modèle de relance enregistré");
}

/** Envoie un e-mail de test à l'administrateur connecté (en mode journal, rien ne part : le message le dit). */
export async function sendTestEmailAction() {
  const user = await requirePermission("settings:manage");
  const back = "/parametres/configuration";
  const real = Boolean(process.env.SMTP_HOST?.trim());
  try {
    await getMailTransport().send({
      to: user.email,
      subject: "Test d'envoi : application de facturation",
      text: "Si vous lisez ce message, la configuration d'e-mail fonctionne.",
    });
    await audit(db, { userId: user.id, userEmail: user.email, ip: await getClientIp(), action: "mail.test", entity: "settings", entityId: "mail", after: { real } });
  } catch (e) {
    flash(back, "error", `Échec de l'envoi de test : ${messageOf(e)}`);
  }
  flash(back, "ok", real ? `E-mail de test envoyé à ${user.email}` : "Mode journal : aucun e-mail réel n'a été envoyé (SMTP non configuré). Le résumé est dans la console du serveur.");
}
