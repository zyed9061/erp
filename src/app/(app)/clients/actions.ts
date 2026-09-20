"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { getClientIp, requirePermission } from "@/lib/auth/session";
import { flash, messageOf, str } from "@/lib/action-utils";
import { addContact, createCustomer, removeContact, setCustomerActive, updateCustomer } from "@/lib/customers";
import { formBool } from "@/lib/validation";

function customerFromForm(f: FormData) {
  return {
    type: str(f.get("type")) as "entreprise",
    name: str(f.get("name")),
    matriculeFiscal: str(f.get("matriculeFiscal")),
    taxStatus: str(f.get("taxStatus")) as "assujetti",
    address: str(f.get("address")),
    city: str(f.get("city")),
    postalCode: str(f.get("postalCode")),
    country: str(f.get("country")) || "TN",
    phone: str(f.get("phone")),
    email: str(f.get("email")),
    paymentTermId: str(f.get("paymentTermId")),
    stampExempt: formBool(f.get("stampExempt")),
    withholdingApplies: formBool(f.get("withholdingApplies")),
    withholdingRateId: str(f.get("withholdingRateId")),
    notes: str(f.get("notes")),
  };
}

async function actorOf() {
  const user = await requirePermission("customers:write");
  return { id: user.id, email: user.email, ip: await getClientIp() };
}

export async function createCustomerAction(formData: FormData) {
  const actor = await actorOf();
  let id: string;
  try {
    const created = await createCustomer(db, actor, { ...customerFromForm(formData), code: str(formData.get("code")) });
    id = created.id;
  } catch (e) {
    flash("/clients/nouveau", "error", messageOf(e));
  }
  flash(`/clients/${id}`, "ok", "Client créé");
}

export async function updateCustomerAction(formData: FormData) {
  const actor = await actorOf();
  const id = z.string().uuid().parse(formData.get("id"));
  try {
    await updateCustomer(db, actor, id, customerFromForm(formData));
  } catch (e) {
    flash(`/clients/${id}`, "error", messageOf(e));
  }
  flash(`/clients/${id}`, "ok", "Client mis à jour");
}

export async function toggleCustomerAction(formData: FormData) {
  const actor = await actorOf();
  const id = z.string().uuid().parse(formData.get("id"));
  const isActive = formData.get("isActive") === "true";
  await setCustomerActive(db, actor, id, isActive);
  redirect(`/clients/${id}`);
}

export async function addContactAction(formData: FormData) {
  const actor = await actorOf();
  const customerId = z.string().uuid().parse(formData.get("customerId"));
  try {
    await addContact(db, actor, customerId, {
      name: str(formData.get("name")),
      email: str(formData.get("email")),
      phone: str(formData.get("phone")),
      role: str(formData.get("role")),
      isBilling: formBool(formData.get("isBilling")),
    });
  } catch (e) {
    flash(`/clients/${customerId}`, "error", messageOf(e));
  }
  flash(`/clients/${customerId}`, "ok", "Contact ajouté");
}

export async function removeContactAction(formData: FormData) {
  const actor = await actorOf();
  const customerId = z.string().uuid().parse(formData.get("customerId"));
  try {
    await removeContact(db, actor, z.string().uuid().parse(formData.get("contactId")));
  } catch (e) {
    flash(`/clients/${customerId}`, "error", messageOf(e));
  }
  flash(`/clients/${customerId}`, "ok", "Contact supprimé");
}
