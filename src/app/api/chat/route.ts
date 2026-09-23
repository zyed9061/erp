import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { auth } from "@/auth";
import { AI_MODEL, getOpenAI, isAiConfigured } from "@/lib/ai/openai";
import { buildAssistantInstructions } from "@/lib/ai/instructions";
import { aiToolDefinitions, runAiTool } from "@/lib/ai/tools";
import { chatRequestSchema, type ChatStreamEvent } from "@/lib/ai/chat-protocol";

/** Nombre maximum d'allers-retours modele <-> outils pour une question. */
const MAX_STEPS = 6;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Non authentifie" }, { status: 401 });
  }

  if (!isAiConfigured()) {
    return Response.json({ error: "Assistant IA non configure (OPENAI_API_KEY manquante)." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corps de requete invalide." }, { status: 400 });
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Requete invalide." }, { status: 400 });
  }

  const instructions = await buildAssistantInstructions(session.user.name);
  const input: ResponseInputItem[] = parsed.data.messages.map((m) => ({ role: m.role, content: m.content }));
  const openai = getOpenAI();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        let wroteText = false;
        let finished = false;

        for (let step = 0; step < MAX_STEPS; step++) {
          const responseStream = openai.responses.stream(
            {
              model: AI_MODEL,
              instructions,
              input,
              tools: aiToolDefinitions,
              // Pas de stockage cote OpenAI : l'historique complet est renvoye a chaque etape.
              // gpt-4.1 n'est pas un modele de raisonnement : ni `reasoning` ni
              // `include: ["reasoning.encrypted_content"]` ne doivent etre envoyes.
              store: false,
            },
            { signal: request.signal },
          );

          let separatorPending = wroteText;
          for await (const event of responseStream) {
            if (event.type === "response.output_text.delta") {
              if (separatorPending) {
                send({ type: "text", delta: "\n\n" });
                separatorPending = false;
              }
              wroteText = true;
              send({ type: "text", delta: event.delta });
            } else if (event.type === "response.output_item.added" && event.item.type === "function_call") {
              send({ type: "tool", name: event.item.name });
            }
          }

          const response = await responseStream.finalResponse();
          if (response.status === "incomplete") {
            send({ type: "error", code: "incomplete" });
            finished = true;
            break;
          }

          const calls = response.output.filter((item) => item.type === "function_call");
          if (calls.length === 0) {
            finished = true;
            break;
          }

          input.push(...toResponseInputItems(response.output));
          const outputs = await Promise.all(calls.map((call) => runAiTool(call.name, call.arguments)));
          calls.forEach((call, index) => {
            input.push({ type: "function_call_output", call_id: call.call_id, output: outputs[index] });
          });
        }

        if (!finished) send({ type: "error", code: "too_many_steps" });
        send({ type: "done" });
      } catch (error) {
        if (request.signal.aborted) {
          controller.close();
          return;
        }
        if (error instanceof OpenAI.APIError) {
          console.error(`[assistant-ia] erreur OpenAI ${error.status ?? ""}`, error.message);
        } else {
          console.error("[assistant-ia] erreur inattendue", error);
        }
        send({ type: "error", code: "upstream" });
        send({ type: "done" });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
