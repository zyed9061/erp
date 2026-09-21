"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { loginLimiter } from "@/lib/auth/rate-limit";
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

  const ip = await getClientIp();
  // Sans adresse connue, on ne limite pas par IP (sinon un seul attaquant bloquerait tout le monde) : le verrouillage par compte reste actif.
  if (ip && loginLimiter.isBlocked(ip)) return { error: MESSAGES.locked };

  const result = await authenticate(db, {
    ...parsed.data,
    ip,
    userAgent: (await headers()).get("user-agent"),
  });
  if (!result.ok) {
    if (ip) loginLimiter.record(ip); // on ne compte que les échecs
    return { error: MESSAGES[result.reason] };
  }

  await setSessionCookie(result.token, result.expiresAt);
  redirect("/");
}
