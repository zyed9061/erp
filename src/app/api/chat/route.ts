import { z } from "zod";
import { auth } from "@/auth";
import { askAssistant, AssistantError } from "@/lib/chat/assistant";
import { getLocale } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(30)
    .refine((m) => m[m.length - 1].role === "user", "The last message must come from the user"),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    // Only the most recent turns are sent: enough context for follow-ups, bounded cost.
    const t = createTranslator(await getLocale());
    const reply = await askAssistant(body.data.messages.slice(-12), t("assistant.notFound"));
    return Response.json({ reply });
  } catch (err) {
    const code = err instanceof AssistantError ? err.code : "upstream";
    if (!(err instanceof AssistantError)) console.error("[chat] unexpected error", err);
    return Response.json({ error: code }, { status: code === "not_configured" ? 503 : 502 });
  }
}
