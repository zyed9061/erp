"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import { db } from "@/db";
import { ROLES } from "@/db/schema";
import { getClientIp, requirePermission } from "@/lib/auth/session";
import { UserError, createUser, updateUser } from "@/lib/users";

function done(kind: "ok" | "error", message: string): never {
  revalidatePath("/utilisateurs");
  redirect(`/utilisateurs?${kind}=${encodeURIComponent(message)}`);
}

function messageOf(e: unknown) {
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Données invalides";
  if (e instanceof UserError) return e.message;
  throw e; // erreur inattendue : laisser Next.js la traiter (y compris les redirections)
}

export async function createUserAction(formData: FormData) {
  const actor = await requirePermission("users:manage");
  try {
    await createUser(db, { id: actor.id, email: actor.email, ip: await getClientIp() }, {
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      role: String(formData.get("role") ?? "") as (typeof ROLES)[number],
      password: String(formData.get("password") ?? ""),
    });
  } catch (e) {
    done("error", messageOf(e));
  }
  done("ok", "Utilisateur créé");
}

const updateSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(ROLES),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true"),
  password: z.string().optional(),
});

export async function updateUserAction(formData: FormData) {
  const actor = await requirePermission("users:manage");
  try {
    const data = updateSchema.parse({
      id: formData.get("id"),
      role: formData.get("role"),
      isActive: formData.get("isActive"),
      password: String(formData.get("password") ?? "") || undefined,
    });
    await updateUser(db, { id: actor.id, email: actor.email, ip: await getClientIp() }, data.id, {
      role: data.role,
      isActive: data.isActive,
      password: data.password,
    });
  } catch (e) {
    done("error", messageOf(e));
  }
  done("ok", "Utilisateur mis à jour");
}
