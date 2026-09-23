import OpenAI from "openai";

export const AI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

let client: OpenAI | undefined;

/** Client OpenAI cote serveur uniquement : la cle n'est jamais exposee au navigateur. */
export function getOpenAI() {
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export function isAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}
