"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { authenticate } from "@/lib/auth/service";
import { getClientIp, setSessionCookie } from "@/lib/auth/session";

const schema = z.object({
  email: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

export type LoginState = { error?: string };

const MESSAGES = {
  invalid: "E-mail ou mot de passe incorrect.",
  locked: "Trop de tentatives. Réessayez dans quelques minutes.",
  inactive: "Ce compte est désactivé. Contactez un administrateur.",
} as const;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: MESSAGES.invalid };

  const result = await authenticate(db, {
    ...parsed.data,
    ip: await getClientIp(),
    userAgent: (await headers()).get("user-agent"),
  });
  if (!result.ok) return { error: MESSAGES[result.reason] };

  await setSessionCookie(result.token, result.expiresAt);
  redirect("/");
}
