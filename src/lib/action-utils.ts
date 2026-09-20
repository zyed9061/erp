import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { AmountError } from "./money";
import { ServiceError } from "./errors";

/** Message affichable pour une erreur attendue ; toute autre erreur (bug, redirection) est relancée. */
export function messageOf(e: unknown): string {
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Données invalides";
  if (e instanceof ServiceError || e instanceof AmountError) return e.message;
  throw e;
}

/** Redirige vers `path` avec un message flash (?ok=... ou ?error=...). */
export function flash(path: string, kind: "ok" | "error", message: string): never {
  revalidatePath(path);
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

export const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
