import { z } from "zod";

/** Limites de la conversation envoyee a /api/chat. */
export const CHAT_MAX_MESSAGES = 20;
export const CHAT_MAX_MESSAGE_LENGTH = 4000;

export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(CHAT_MAX_MESSAGE_LENGTH),
      }),
    )
    .min(1)
    .max(CHAT_MAX_MESSAGES)
    .refine((messages) => messages[messages.length - 1].role === "user", {
      message: "Le dernier message doit provenir de l'utilisateur.",
    }),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Evenements envoyes par /api/chat, un objet JSON par ligne (NDJSON). */
export type ChatStreamEvent =
  | { type: "tool"; name: string }
  | { type: "text"; delta: string }
  | { type: "error"; code: "incomplete" | "upstream" | "too_many_steps" }
  | { type: "done" };
