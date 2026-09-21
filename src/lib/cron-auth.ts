import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const digest = (v: string) => createHash("sha256").update(v).digest();

/**
 * Authentifie un appel de planificateur externe : `Authorization: Bearer $CRON_SECRET`, comparé à temps constant.
 * Renvoie une réponse d'erreur à retourner telle quelle, ou null si l'appel est autorisé.
 * Désactivé (404) tant que CRON_SECRET n'est pas défini.
 */
export function checkCronAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("Introuvable", { status: 404 });
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!timingSafeEqual(digest(provided), digest(secret))) return new NextResponse("Non autorisé", { status: 401 });
  return null;
}
