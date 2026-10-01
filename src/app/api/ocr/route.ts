import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { forwardToOcrService, OCR_ALLOWED_TYPES, OCR_MAX_UPLOAD_MB, type OcrErrorBody } from "@/lib/ocr";

export const runtime = "nodejs";

/** Step 1 of invoice extraction: send the uploaded image to PaddleOCR and return the recognized text. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json<OcrErrorBody>({ error: "NO_IMAGE" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json<OcrErrorBody>({ error: "NO_IMAGE" }, { status: 400 });
  }
  if (!OCR_ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json<OcrErrorBody>({ error: "UNSUPPORTED_FORMAT" }, { status: 415 });
  }
  if (file.size > OCR_MAX_UPLOAD_MB * 1024 * 1024) {
    return NextResponse.json<OcrErrorBody>({ error: "IMAGE_TOO_LARGE" }, { status: 413 });
  }

  const upstream = new FormData();
  upstream.append("file", file, file.name);
  return forwardToOcrService("/api/ocr", { method: "POST", body: upstream }, "ocr");
}
