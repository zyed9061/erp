import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getLocale } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";
import type { Locale } from "@/i18n/config";

export const runtime = "nodejs";

const MAX_QUESTION_LENGTH = 4000;
const REQUEST_TIMEOUT_MS = 90_000;
const SESSION_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** Language name the workflow's agent is told to answer in, per app locale. */
const REPLY_LANGUAGE: Record<Locale, string> = {
  fr: "French",
  en: "English",
  ar: "Arabic",
  de: "German",
};

/**
 * Relays a question to the document assistant (the n8n "rag" workflow's Chat Trigger).
 * The webhook URL stays on the server, and the n8n memory session is namespaced by user
 * so one user can never continue another user's conversation. The app language travels
 * as `metadata`, which the workflow's system prompt uses to pick the reply language.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.RAG_CHAT_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { question, sessionId } = (body ?? {}) as { question?: unknown; sessionId?: unknown };
  if (
    typeof question !== "string" ||
    !question.trim() ||
    question.length > MAX_QUESTION_LENGTH ||
    typeof sessionId !== "string" ||
    !SESSION_ID_PATTERN.test(sessionId)
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const locale = await getLocale();
  const t = createTranslator(locale);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sendMessage",
        sessionId: `erp-${session.user.id}-${sessionId}`,
        chatInput: question.trim(),
        metadata: { language: REPLY_LANGUAGE[locale], notFoundMessage: t("assistant.notFound") },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[assistant] n8n responded with ${res.status}`);
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }

    const data: unknown = await res.json();
    const payload = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    const answer = payload?.output ?? payload?.text ?? payload?.response;
    if (typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }
    return NextResponse.json({ answer });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("[assistant] request failed:", error);
    return NextResponse.json({ error: timedOut ? "timeout" : "upstream" }, { status: timedOut ? 504 : 502 });
  }
}
