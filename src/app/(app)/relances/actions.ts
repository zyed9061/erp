"use server";

import { z } from "zod";
import { db } from "@/db";
import { getClientIp, requirePermission } from "@/lib/auth/session";
import { flash, messageOf } from "@/lib/action-utils";
import { runReminders, sendManualReminder } from "@/lib/invoicing/reminders";

async function actorOf() {
  const user = await requirePermission("payments:write");
  return { id: user.id, email: user.email, ip: await getClientIp() };
}

export async function runRemindersAction() {
  const actor = await actorOf();
  let summary;
  try {
    summary = await runReminders(db, { actor });
  } catch (e) {
    flash("/relances", "error", messageOf(e));
  }
  const parts = [`${summary.sent.length} relance(s) envoyée(s)`];
  if (summary.skipped.length) parts.push(`${summary.skipped.length} ignorée(s) (pas d'adresse e-mail)`);
  if (summary.failed.length) parts.push(`${summary.failed.length} en échec`);
  flash("/relances", summary.failed.length ? "error" : "ok", parts.join(" · "));
}

export async function sendReminderAction(formData: FormData) {
  const actor = await actorOf();
  const id = z.string().uuid().parse(formData.get("id"));
  try {
    const r = await sendManualReminder(db, actor, id);
    flash("/relances", "ok", `Relance de niveau ${r.level} envoyée à ${r.to}`);
  } catch (e) {
    flash("/relances", "error", messageOf(e));
  }
}
