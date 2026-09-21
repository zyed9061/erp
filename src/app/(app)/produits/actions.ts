"use server";

import { z } from "zod";
import { db } from "@/db";
import { getClientIp, requirePermission } from "@/lib/auth/session";
import { flash, messageOf, str } from "@/lib/action-utils";
import { createProduct, setProductActive, updateProduct } from "@/lib/products";
import { formBool } from "@/lib/validation";

function productFromForm(f: FormData) {
  return {
    type: str(f.get("type")) as "bien",
    name: str(f.get("name")),
    description: str(f.get("description")),
    unit: str(f.get("unit")),
    unitPrice: str(f.get("unitPrice")),
    tvaRateId: str(f.get("tvaRateId")),
    fodecApplicable: formBool(f.get("fodecApplicable")),
    trackStock: formBool(f.get("trackStock")),
    minStock: str(f.get("minStock")) || "0",
  };
}

async function actorOf() {
  const user = await requirePermission("products:write");
  return { id: user.id, email: user.email, ip: await getClientIp() };
}

export async function createProductAction(formData: FormData) {
  const actor = await actorOf();
  let id: string;
  try {
    id = (await createProduct(db, actor, { ...productFromForm(formData), code: str(formData.get("code")) })).id;
  } catch (e) {
    flash("/produits/nouveau", "error", messageOf(e));
  }
  flash(`/produits/${id}`, "ok", "Article créé");
}

export async function updateProductAction(formData: FormData) {
  const actor = await actorOf();
  const id = z.string().uuid().parse(formData.get("id"));
  try {
    await updateProduct(db, actor, id, productFromForm(formData));
  } catch (e) {
    flash(`/produits/${id}`, "error", messageOf(e));
  }
  flash(`/produits/${id}`, "ok", "Article mis à jour");
}

export async function toggleProductAction(formData: FormData) {
  const actor = await actorOf();
  const id = z.string().uuid().parse(formData.get("id"));
  await setProductActive(db, actor, id, formData.get("isActive") === "true");
  flash(`/produits/${id}`, "ok", "État mis à jour");
}
