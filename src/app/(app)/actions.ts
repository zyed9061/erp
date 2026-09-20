"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { audit } from "@/lib/audit";
import { clearSession, getClientIp, getCurrentUser } from "@/lib/auth/session";

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) {
    await audit(db, {
      userId: user.id, userEmail: user.email, action: "logout",
      entity: "user", entityId: user.id, ip: await getClientIp(),
    });
  }
  await clearSession();
  redirect("/login");
}
