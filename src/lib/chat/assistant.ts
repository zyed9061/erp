import { openAiTools, runTool } from "./tools";

// Database assistant: GPT answers only from the read-only tools in ./tools.ts.
// Uses the OpenAI Chat Completions API over fetch (no SDK dependency).

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export class AssistantError extends Error {
  constructor(public code: "not_configured" | "upstream") {
    super(code);
  }
}

const MAX_TOOL_ROUNDS = 6;

function systemPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  return `You are the assistant of an invoicing ERP (Tunisia, amounts in TND with 3 decimals). Today is ${today}.

Rules:
- Answer ONLY with facts returned by the tools in this conversation. Never guess, estimate, extrapolate or use outside knowledge.
- Always call a tool before giving any number, name or date, even if you think you know it.
- If the tools cannot answer the question, say that this information is not available in the database. Do not invent a workaround.
- Politely decline any question unrelated to this company's data (general knowledge, coding, advice...).
- You are read-only: you cannot create, modify, send or delete anything.
- Reply in the language of the user's last message. Be short: one or two sentences, or a short "- " list. Plain text, **bold** allowed, no tables, no headings.
- Format amounts like "1 234,500 TND". Use document numbers (e.g. FAC-2026-0412) when listing documents.
- Invoice statuses: BROUILLON draft, ENVOYEE sent, PARTIELLEMENT_PAYEE partly paid, PAYEE paid, EN_RETARD overdue, ANNULEE cancelled. Quotes (devis), credit notes (avoirs).
- When a tool lists only some rows, use its "matched" count and totals for "how many / how much" questions.`;
}

type ApiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

async function complete(messages: ApiMessage[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AssistantError("not_configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1",
      temperature: 0,
      messages,
      tools: openAiTools,
    }),
    signal: AbortSignal.timeout(45_000),
  }).catch((err) => {
    console.error("[chat] OpenAI request failed", err);
    throw new AssistantError("upstream");
  });

  if (!res.ok) {
    console.error(`[chat] OpenAI ${res.status}`, (await res.text()).slice(0, 500));
    throw new AssistantError("upstream");
  }
  const data = await res.json();
  return data.choices[0].message as { content: string | null; tool_calls?: ToolCall[] };
}

export async function askAssistant(history: ChatMessage[]): Promise<string> {
  const messages: ApiMessage[] = [{ role: "system", content: systemPrompt() }, ...history];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const reply = await complete(messages);
    if (!reply.tool_calls?.length) return reply.content?.trim() ?? "";

    messages.push({ role: "assistant", content: reply.content, tool_calls: reply.tool_calls });
    const results = await Promise.all(
      reply.tool_calls.map((call) => runTool(call.function.name, call.function.arguments)),
    );
    reply.tool_calls.forEach((call, i) => {
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(results[i]) });
    });
  }
  throw new AssistantError("upstream");
}
