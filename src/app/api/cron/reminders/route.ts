import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { checkCronAuth } from "@/lib/cron-auth";
import { runReminders } from "@/lib/invoicing/reminders";

export const dynamic = "force-dynamic";

/**
 * Point d'entrée pour un planificateur externe (cron, GitHub Actions…) :
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine/api/cron/reminders
 * Idempotent : relançable sans doublon.
 */
async function handle(request: NextRequest) {
  const denied = checkCronAuth(request);
  if (denied) return denied;
  const summary = await runReminders(db);
  return NextResponse.json({
    sent: summary.sent.length, skipped: summary.skipped.length, failed: summary.failed.length, details: summary,
  });
}

export { handle as GET, handle as POST };
