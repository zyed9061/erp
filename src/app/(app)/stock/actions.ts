"use server";

import { z } from "zod";
import { db } from "@/db";
import { getClientIp, requirePermission } from "@/lib/auth/session";
import { flash, messageOf, str } from "@/lib/action-utils";
import { addStockMovement } from "@/lib/stock";

export async function addMovementAction(formData: FormData) {
  const user = await requirePermission("stock:write");
  const productId = z.string().uuid().parse(formData.get("productId"));
  try {
    await addStockMovement(db, { id: user.id, email: user.email, ip: await getClientIp() }, {
      productId,
      type: str(formData.get("type")) as "entry",
      quantity: str(formData.get("quantity")),
      occurredOn: str(formData.get("occurredOn")) || undefined,
      reference: str(formData.get("reference")),
      notes: str(formData.get("notes")),
    });
  } catch (e) {
    flash(`/stock/${productId}`, "error", messageOf(e));
  }
  flash(`/stock/${productId}`, "ok", "Mouvement enregistré");
}
