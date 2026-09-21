import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { checkCronAuth } from "@/lib/cron-auth";
import { runRecurring } from "@/lib/invoicing/recurring";

export const dynamic = "force-dynamic";

/**
 * Génère les factures récurrentes échues :
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine/api/cron/recurring
 * Idempotent : une période n'est jamais générée deux fois.
 */
async function handle(request: NextRequest) {
  const denied = checkCronAuth(request);
  if (denied) return denied;
  const summary = await runRecurring(db);
  return NextResponse.json({ generated: summary.generated.length, failed: summary.failed.length, details: summary });
}

export { handle as GET, handle as POST };
