import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { runReminders } from "@/lib/invoicing/reminders";

export const dynamic = "force-dynamic";

const digest = (v: string) => createHash("sha256").update(v).digest();

/**
 * Point d'entrée pour un planificateur externe (cron, GitHub Actions…) :
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine/api/cron/reminders
 * Désactivé (404) tant que CRON_SECRET n'est pas défini. Idempotent : relançable sans doublon.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("Introuvable", { status: 404 });
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!timingSafeEqual(digest(provided), digest(secret))) return new NextResponse("Non autorisé", { status: 401 });

  const summary = await runReminders(db);
  return NextResponse.json({
    sent: summary.sent.length, skipped: summary.skipped.length, failed: summary.failed.length, details: summary,
  });
}

export { handle as GET, handle as POST };
