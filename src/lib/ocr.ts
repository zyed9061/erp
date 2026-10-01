import { NextResponse } from "next/server";

/** Same limits as the PaddleOCR service (`MAX_UPLOAD_MB`, `allowed_mime_types`), checked here first. */
export const OCR_MAX_UPLOAD_MB = 10;
export const OCR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** PaddleOCR on CPU can take a while on the first request (model warm-up). */
const OCR_TIMEOUT_MS = 180_000;
const GPT_TIMEOUT_MS = 75_000;

export interface OcrResult {
  text: string;
  average_confidence: number;
  region_count: number;
  duration_ms: number;
}

export interface ExtractionWarning {
  code: string;
  field: string;
  value: string;
}

export interface ExtractionResult {
  fields: { sender_name: string; amount: string; date: string };
  warnings: ExtractionWarning[];
  complete: boolean;
  model: string;
  raw_response: string;
}

/** Error body returned to the browser: `code` is an `extract.errors.*` key. */
export type OcrErrorBody = { error: string };

/**
 * Forwards a request to the PaddleOCR service (OCR_APP_URL) from the server, so the browser
 * only ever talks to the ERP and the service can stay bound to 127.0.0.1. Upstream errors keep
 * their `error.code` so the client can translate them; transport failures map to
 * `unavailable` / `timeout`.
 */
export async function forwardToOcrService(path: "/api/ocr" | "/api/extract", init: RequestInit, kind: "ocr" | "gpt") {
  const baseUrl = process.env.OCR_APP_URL;
  if (!baseUrl) {
    return NextResponse.json<OcrErrorBody>({ error: "unavailable" }, { status: 503 });
  }

  try {
    const res = await fetch(new URL(path, baseUrl), {
      ...init,
      signal: AbortSignal.timeout(kind === "ocr" ? OCR_TIMEOUT_MS : GPT_TIMEOUT_MS),
      cache: "no-store",
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
      console.error(`[ocr] ${path} responded with ${res.status}${typeof code === "string" ? ` (${code})` : ""}`);
      return NextResponse.json<OcrErrorBody>(
        { error: typeof code === "string" ? code : "generic" },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error(`[ocr] ${path} request failed:`, error);
    return NextResponse.json<OcrErrorBody>(
      { error: timedOut ? "timeout" : "unavailable" },
      { status: timedOut ? 504 : 502 },
    );
  }
}
