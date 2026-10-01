import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { forwardToOcrService, type OcrErrorBody } from "@/lib/ocr";

export const runtime = "nodejs";

/** Same cap as the PaddleOCR service's `ExtractRequest.ocr_text`. */
const MAX_OCR_TEXT_LENGTH = 50_000;

/** Step 2 of invoice extraction: let GPT pull sender, amount and date out of the OCR text. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<OcrErrorBody>({ error: "generic" }, { status: 400 });
  }

  const ocrText = (body as { ocrText?: unknown } | null)?.ocrText;
  if (typeof ocrText !== "string" || !ocrText.trim()) {
    return NextResponse.json<OcrErrorBody>({ error: "OCR_NO_TEXT" }, { status: 422 });
  }
  if (ocrText.length > MAX_OCR_TEXT_LENGTH) {
    return NextResponse.json<OcrErrorBody>({ error: "generic" }, { status: 400 });
  }

  return forwardToOcrService(
    "/api/extract",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ocr_text: ocrText }),
    },
    "gpt",
  );
}
