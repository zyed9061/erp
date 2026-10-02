"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Banknote,
  Braces,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  ImageIcon,
  Loader2,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLocale } from "@/i18n/client";
import { useToast } from "@/components/ui/Toast";
import { Shake } from "@/components/motion/Motion";
import type { ExtractionResult, ExtractionWarning, OcrErrorBody, OcrResult } from "@/lib/ocr";

const EASE = [0.22, 1, 0.36, 1] as const;

type Step = "upload" | "ocr" | "gpt" | "done";
const STEPS: { id: Step; labelKey: string }[] = [
  { id: "upload", labelKey: "extract.stepUpload" },
  { id: "ocr", labelKey: "extract.stepOcr" },
  { id: "gpt", labelKey: "extract.stepGpt" },
  { id: "done", labelKey: "extract.stepDone" },
];

/** Hero pipeline chips; `step` lights the chip up while (or after) that step runs. */
const PIPELINE: { labelKey?: string; label?: string; icon: LucideIcon; step: Step }[] = [
  { labelKey: "extract.pipelineImage", icon: ImageIcon, step: "upload" },
  { label: "PaddleOCR", icon: ScanSearch, step: "ocr" },
  { label: "GPT", icon: Sparkles, step: "gpt" },
  { labelKey: "extract.pipelineJson", icon: Braces, step: "done" },
];

const FIELDS = [
  { key: "sender_name", labelKey: "extract.fieldSender", icon: Building2, tint: "from-brand-500 to-violet-500" },
  { key: "amount", labelKey: "extract.fieldAmount", icon: Banknote, tint: "from-emerald-500 to-teal-500" },
  { key: "date", labelKey: "extract.fieldDate", icon: CalendarDays, tint: "from-amber-500 to-orange-500" },
] as const;

const FIELD_LABEL_KEYS: Record<string, string> = {
  sender_name: "extract.fieldSender",
  amount: "extract.fieldAmount",
  date: "extract.fieldDate",
};

const WARNING_KEYS: Record<string, string> = {
  INVALID_DATE: "extract.warnInvalidDate",
  DATE_NOT_ISO: "extract.warnDateNotIso",
  AMOUNT_NOT_IN_OCR: "extract.warnAmountNotInOcr",
  FIELD_MISSING: "extract.warnFieldMissing",
};

class ExtractError extends Error {}

async function postJson<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ExtractError("unavailable");
  }
  const data = (await res.json().catch(() => null)) as T | OcrErrorBody | null;
  if (!res.ok || !data) {
    throw new ExtractError((data as OcrErrorBody | null)?.error ?? "generic");
  }
  return data as T;
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(ms: number) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

const BLOBS = [
  { className: "-top-24 -start-16 h-72 w-72 bg-brand-300", x: [0, 50, -30, 0], y: [0, 30, 20, 0], duration: 22 },
  { className: "-top-10 -end-20 h-64 w-64 bg-fuchsia-300", x: [0, -40, 30, 0], y: [0, 40, -10, 0], duration: 26 },
  { className: "-bottom-28 start-1/3 h-64 w-64 bg-violet-300", x: [0, 30, -40, 0], y: [0, -30, 10, 0], duration: 30 },
];

function Hero({ description, activeStep, doneSteps }: { description: string; activeStep: Step | null; doneSteps: Step[] }) {
  const { t } = useLocale();
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="card relative mb-6 overflow-hidden px-5 py-9 text-center sm:px-10 sm:py-12"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {BLOBS.map((blob, i) => (
          <motion.span
            key={i}
            className={`absolute rounded-full opacity-40 blur-3xl ${blob.className}`}
            animate={reduceMotion ? undefined : { x: blob.x, y: blob.y, scale: [1, 1.08, 0.95, 1] }}
            transition={{ duration: blob.duration, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
        <div className="absolute inset-0 bg-[radial-gradient(rgb(99_102_241/0.12)_1px,transparent_1px)] mask-[radial-gradient(ellipse_at_center,black_30%,transparent_75%)] bg-size-[18px_18px]" />
      </div>

      <div className="relative">
        <h2 className="text-2xl leading-tight font-extrabold tracking-tight text-balance text-slate-900 sm:text-4xl">
          {t("extract.heroTitle1")}{" "}
          <span className="animate-gradient-pan motion-reduce:animate-none bg-linear-to-r from-brand-600 via-fuchsia-500 to-violet-600 bg-size-[200%_200%] bg-clip-text text-transparent">
            {t("extract.heroTitle2")}
          </span>
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-pretty text-slate-500 sm:text-base">{description}</p>

        <ol className="mt-6 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2" aria-label="Pipeline">
          {PIPELINE.map((chip, i) => {
            const Icon = chip.icon;
            const active = activeStep === chip.step;
            const done = doneSteps.includes(chip.step);
            return (
              <Fragment key={chip.step}>
                {i > 0 && (
                  <li aria-hidden="true" className="relative hidden h-0.5 w-7 overflow-hidden rounded-full bg-brand-200 sm:block">
                    <motion.span
                      className="bg-brand-gradient absolute inset-y-0 w-1/2"
                      animate={reduceMotion ? undefined : { x: ["-100%", "200%"] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "linear", delay: i * 0.3 }}
                    />
                  </li>
                )}
                <motion.li
                  whileHover={{ y: -2 }}
                  animate={active ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                  transition={active ? { duration: 1.2, repeat: Infinity } : { type: "spring", stiffness: 400, damping: 25 }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold shadow-xs ring-1 transition-colors sm:px-3 sm:text-[13px] ${
                    active
                      ? "bg-brand-gradient text-white shadow-lg shadow-brand-600/30 ring-white/30"
                      : done
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-white/90 text-slate-700 ring-slate-200 backdrop-blur"
                  }`}
                >
                  {done && !active ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Icon className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
                  )}
                  {chip.labelKey ? t(chip.labelKey) : chip.label}
                </motion.li>
              </Fragment>
            );
          })}
        </ol>
      </div>
    </motion.section>
  );
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

function CardTitle({ id, num, children }: { id: string; num: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 id={id} className="section-title mb-4 flex items-center gap-2.5 text-[15px]">
      <span className="bg-brand-gradient flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white shadow-md shadow-brand-600/30">
        {num}
      </span>
      {children}
    </h2>
  );
}

/** Copy button that swaps to a check mark for a moment after copying. */
function CopyButton({ text, label, onCopy, wide = false }: { text: string; label: string; onCopy: (text: string) => Promise<boolean>; wide?: boolean }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleClick() {
    if (await onCopy(text)) setCopied(true);
  }

  const icon = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={copied ? "done" : "copy"}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="flex"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </motion.span>
    </AnimatePresence>
  );

  if (wide) {
    return (
      <motion.button type="button" whileTap={{ scale: 0.98 }} className="btn-secondary h-11 w-full" onClick={handleClick}>
        {icon}
        {copied ? t("extract.copiedShort") : label}
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={handleClick}
      aria-label={label}
      title={copied ? t("extract.copiedShort") : t("extract.copy")}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-brand-600 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-brand-400"
    >
      {icon}
    </motion.button>
  );
}

function EmptyIllustration() {
  return (
    <motion.svg
      viewBox="0 0 120 120"
      className="h-28 w-28"
      aria-hidden="true"
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <defs>
        <linearGradient id="extract-empty-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#d946ef" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="54" fill="url(#extract-empty-g)" opacity=".1" />
      <path d="M38 22h44v76l-7-5-7 5-7-5-7 5-7-5-9 5z" fill="#fff" stroke="url(#extract-empty-g)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M48 40h24M48 52h24M48 64h14" stroke="url(#extract-empty-g)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="84" cy="80" r="13" fill="#fff" stroke="url(#extract-empty-g)" strokeWidth="3" />
      <path d="m93 89 8 8" stroke="url(#extract-empty-g)" strokeWidth="3.5" strokeLinecap="round" />
    </motion.svg>
  );
}

function SuccessBadge() {
  return (
    <span className="relative flex h-7 w-7 items-center justify-center">
      <motion.span
        className="absolute inset-0 rounded-lg bg-emerald-400"
        initial={{ opacity: 0.6, scale: 1 }}
        animate={{ opacity: 0, scale: 1.9 }}
        transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
      />
      <motion.span
        className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-emerald-500 to-teal-500 shadow-md shadow-emerald-600/30"
        initial={{ scale: 0.4 }}
        animate={{ scale: [0.4, 1.15, 1] }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.25, ease: "easeOut" }}
          />
        </svg>
      </motion.span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Extractor                                                                  */
/* -------------------------------------------------------------------------- */

export function InvoiceExtractor({
  maxUploadMb,
  allowedTypes,
  description,
}: {
  maxUploadMb: number;
  allowedTypes: string[];
  description: string;
}) {
  const { t } = useLocale();
  const { showError } = useToast();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropzoneControls = useAnimationControls();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [doneSteps, setDoneSteps] = useState<Step[]>([]);
  const [activeStep, setActiveStep] = useState<Step | null>(null);
  const [durations, setDurations] = useState<Partial<Record<Step, number>>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function resetRun() {
    setDoneSteps([]);
    setActiveStep(null);
    setDurations({});
    setFileError(null);
    setRunError(null);
    setOcr(null);
    setResult(null);
  }

  function rejectFile(message: string) {
    setFileError(message);
    dropzoneControls.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.45 } });
  }

  function selectFile(candidate: File | undefined) {
    if (!candidate || running) return;
    resetRun();
    if (!allowedTypes.includes(candidate.type)) {
      rejectFile(t("extract.invalidType"));
      return;
    }
    if (candidate.size > maxUploadMb * 1024 * 1024) {
      rejectFile(t("extract.tooLarge", { size: maxUploadMb }));
      return;
    }
    setFile(candidate);
  }

  function removeFile() {
    setFile(null);
    setPreviewUrl(null);
    resetRun();
    if (inputRef.current) inputRef.current.value = "";
  }

  function openPicker() {
    inputRef.current?.click();
  }

  async function runExtraction() {
    if (!file) return;
    resetRun();
    setRunning(true);
    try {
      setActiveStep("upload");
      const form = new FormData();
      form.append("file", file);
      const ocrStarted = performance.now();
      const ocrPromise = postJson<OcrResult>("/api/ocr", { method: "POST", body: form });
      // The upload itself is near-instant on a local network; the wait is PaddleOCR.
      setDoneSteps(["upload"]);
      setActiveStep("ocr");
      const ocrResult = await ocrPromise;
      setOcr(ocrResult);
      setDurations({ ocr: performance.now() - ocrStarted });

      setDoneSteps(["upload", "ocr"]);
      setActiveStep("gpt");
      const gptStarted = performance.now();
      const extraction = await postJson<ExtractionResult>("/api/ocr/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocrText: ocrResult.text }),
      });
      setDurations((d) => ({ ...d, gpt: performance.now() - gptStarted }));
      setResult(extraction);
      setDoneSteps(["upload", "ocr", "gpt", "done"]);
      setActiveStep(null);
    } catch (err) {
      const code = err instanceof ExtractError ? err.message : "generic";
      const key = `extract.errors.${code}`;
      const message = t(key) === key ? t("extract.errors.generic") : t(key);
      setRunError(message);
      setActiveStep(null);
      showError(message);
    } finally {
      setRunning(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      showError(t("extract.errors.generic"));
      return false;
    }
  }

  function warningText(w: ExtractionWarning) {
    const key = WARNING_KEYS[w.code];
    if (!key) return null;
    return t(key, { value: w.value, field: t(FIELD_LABEL_KEYS[w.field] ?? w.field) });
  }

  const warnings = (result?.warnings ?? []).map(warningText).filter((w): w is string => Boolean(w));
  const scanning = activeStep === "ocr";
  const confidence = ocr ? Math.round(ocr.average_confidence * 100) : 0;

  return (
    <>
      <Hero description={description} activeStep={activeStep} doneSteps={doneSteps} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* ---------------------------------------------------------------- Upload */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
          className="card p-5 sm:p-6"
          aria-labelledby="extract-upload-title"
        >
          <CardTitle id="extract-upload-title" num="1">
            {t("extract.uploadTitle")}
          </CardTitle>

          <input
            ref={inputRef}
            type="file"
            accept={allowedTypes.join(",")}
            hidden
            onChange={(e) => selectFile(e.target.files?.[0])}
          />

          <AnimatePresence mode="wait" initial={false}>
            {!file ? (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25 }}
              >
                <motion.div
                  animate={dropzoneControls}
                  role="button"
                  tabIndex={0}
                  aria-label={t("extract.dropTitle")}
                  aria-describedby={fileError ? "extract-file-error" : undefined}
                  onClick={openPicker}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPicker();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    selectFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`group relative flex min-h-80 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 ${
                    dragOver
                      ? "scale-[1.015] border-brand-500 bg-brand-50 ring-4 ring-brand-500/15"
                      : fileError
                        ? "border-red-300 bg-red-50/40"
                        : "border-brand-200 bg-linear-to-b from-slate-50 to-brand-50/40 hover:border-brand-400 hover:from-brand-50/60"
                  }`}
                >
                  <motion.span
                    animate={
                      reduceMotion
                        ? undefined
                        : dragOver
                          ? { scale: [1, 1.12, 1], y: 0 }
                          : { y: [0, -7, 0], scale: 1 }
                    }
                    transition={{ duration: dragOver ? 0.8 : 3.2, repeat: Infinity, ease: "easeInOut" }}
                    className="bg-brand-gradient mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-xl shadow-brand-600/40 ring-1 ring-white/30"
                  >
                    <Upload className="h-7 w-7" aria-hidden="true" />
                  </motion.span>
                  <AnimatePresence mode="wait" initial={false}>
                    {dragOver ? (
                      <motion.p
                        key="over"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="text-base font-bold text-brand-600"
                      >
                        {t("extract.dropOver")}
                      </motion.p>
                    ) : (
                      <motion.div
                        key="idle"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="flex flex-col items-center gap-2"
                      >
                        <p className="text-[15px] font-semibold text-slate-800">{t("extract.dropTitle")}</p>
                        <p className="text-xs text-slate-400">{t("extract.or")}</p>
                        <span className="btn-secondary h-10 px-4 group-hover:ring-brand-300">{t("extract.browse")}</span>
                        <p className="mt-1 text-xs text-slate-500">{t("extract.formats", { size: maxUploadMb })}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                className="space-y-3"
              >
                <div className="flex justify-center rounded-2xl bg-linear-to-b from-slate-50 to-brand-50/40 p-4 ring-1 ring-slate-200">
                  <div className="relative overflow-hidden rounded-xl bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5">
                    {previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimizable asset
                      <img src={previewUrl} alt={file.name} className="block max-h-[420px] w-auto max-w-full object-contain" />
                    )}
                    <AnimatePresence>
                      {scanning && (
                        <motion.div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 bg-linear-to-b from-brand-500/5 to-fuchsia-500/10"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          {!reduceMotion && (
                            <motion.span
                              className="absolute inset-x-0 top-0 h-16 border-b-2 border-fuchsia-500 bg-linear-to-b from-transparent via-violet-500/25 to-fuchsia-500/70 shadow-[0_6px_18px_rgb(217_70_239/0.55)]"
                              initial={{ y: "-100%" }}
                              animate={{ y: ["-100%", "700%"] }}
                              transition={{ duration: 1.9, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
                            />
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={removeFile}
                      disabled={running}
                      aria-label={t("extract.remove")}
                      title={t("extract.remove")}
                      className="absolute end-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/70 text-white shadow-lg backdrop-blur transition-colors hover:bg-red-600 disabled:opacity-40"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </motion.button>
                  </div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.35, ease: EASE }}
                  className="flex items-center gap-3 rounded-xl bg-slate-50 py-2 ps-3 pe-2 ring-1 ring-slate-200"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
                    <ImageIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
                    <p className="text-xs text-slate-500">{formatSize(file.size)}</p>
                  </div>
                  <button type="button" className="btn-ghost h-10" onClick={openPicker} disabled={running}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{t("extract.replace")}</span>
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {fileError && (
              <Shake
                key={fileError}
                id="extract-file-error"
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {fileError}
              </Shake>
            )}
          </AnimatePresence>

          <motion.button
            type="button"
            whileTap={file && !running ? { scale: 0.98 } : undefined}
            className="btn-primary relative mt-4 h-12 w-full overflow-hidden text-[15px]"
            onClick={runExtraction}
            disabled={!file || running}
          >
            {file && !running && !reduceMotion && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-y-0 w-1/3 -skew-x-12 bg-linear-to-r from-transparent via-white/35 to-transparent"
                initial={{ left: "-40%" }}
                animate={{ left: "130%" }}
                transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {running ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
              )}
              {running ? t("extract.extracting") : t("extract.extractButton")}
            </span>
          </motion.button>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
            {t("extract.privacy")}
          </p>
        </motion.section>

        <div className="flex flex-col gap-6">
          {/* -------------------------------------------------------------- Progress */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18, ease: EASE }}
            className="card p-5 sm:p-6"
            aria-labelledby="extract-status-title"
          >
            <CardTitle id="extract-status-title" num="2">
              {t("extract.statusTitle")}
            </CardTitle>
            <ol aria-live="polite">
              {STEPS.map((step, index) => {
                const done = doneSteps.includes(step.id);
                const active = activeStep === step.id;
                const isLast = index === STEPS.length - 1;
                const duration = durations[step.id];
                return (
                  <li key={step.id} className="relative flex items-center gap-3 py-2">
                    {!isLast && (
                      <span aria-hidden="true" className="absolute start-3.5 top-9 -bottom-2 w-0.5 -translate-x-1/2 rounded-full bg-slate-200 rtl:translate-x-1/2">
                        <motion.span
                          className="absolute inset-0 origin-top rounded-full bg-linear-to-b from-brand-500 to-violet-500"
                          initial={false}
                          animate={{ scaleY: done ? 1 : 0 }}
                          transition={{ duration: 0.5, ease: EASE }}
                        />
                      </span>
                    )}
                    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                      {active && (
                        <motion.span
                          aria-hidden="true"
                          className="absolute -inset-0.5 rounded-full bg-[conic-gradient(from_0deg,var(--color-brand-500),#d946ef,transparent_70%)]"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                      )}
                      <motion.span
                        initial={false}
                        animate={done ? { scale: [0.6, 1.15, 1] } : { scale: 1 }}
                        transition={{ duration: 0.4, ease: EASE }}
                        className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors duration-300 ${
                          done
                            ? "border-transparent bg-linear-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-600/30"
                            : active
                              ? "h-6 w-6 border-transparent bg-white text-brand-600"
                              : "border-slate-200 bg-white text-slate-300"
                        }`}
                      >
                        {done ? (
                          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                        ) : (
                          <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-brand-500" : "bg-current"}`} />
                        )}
                      </motion.span>
                    </span>
                    <span
                      className={`flex-1 text-sm transition-colors ${
                        active ? "font-semibold text-slate-900" : done ? "font-medium text-slate-700" : "text-slate-400"
                      }`}
                    >
                      {t(step.labelKey)}
                    </span>
                    <AnimatePresence>
                      {duration !== undefined && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 tabular-nums ring-1 ring-emerald-200"
                        >
                          {formatDuration(duration)}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ol>
            <AnimatePresence>
              {runError && (
                <Shake
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {runError}
                </Shake>
              )}
            </AnimatePresence>
          </motion.section>

          {/* --------------------------------------------------------------- Results */}
          <AnimatePresence mode="wait">
            {result ? (
              <motion.section
                key="results"
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ type: "spring", stiffness: 240, damping: 24 }}
                className="card relative overflow-hidden p-5 sm:p-6"
                aria-labelledby="extract-results-title"
              >
                <div aria-hidden="true" className="pointer-events-none absolute -end-16 -top-16 h-44 w-44 rounded-full bg-emerald-300/25 blur-3xl" />

                <div className="relative mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 id="extract-results-title" className="section-title flex items-center gap-2.5 text-[15px]">
                    <SuccessBadge />
                    {t("extract.resultsTitle")}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                      result.complete ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"
                    }`}
                  >
                    {result.complete ? t("extract.complete") : t("extract.incomplete")}
                  </span>
                </div>

                {warnings.length > 0 && (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="relative mb-4 space-y-1.5 overflow-hidden rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200"
                  >
                    {warnings.map((w) => (
                      <li key={w} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {w}
                      </li>
                    ))}
                  </motion.ul>
                )}

                <motion.dl
                  className="relative space-y-2.5"
                  initial="hidden"
                  animate="show"
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } } }}
                >
                  {FIELDS.map((field) => {
                    const value = result.fields[field.key];
                    const Icon = field.icon;
                    const label = t(field.labelKey);
                    return (
                      <motion.div
                        key={field.key}
                        variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: EASE } } }}
                        whileHover={{ y: -2 }}
                        className="flex items-center gap-3 rounded-xl bg-linear-to-r from-slate-50 to-white py-3 ps-3 pe-1.5 ring-1 ring-slate-200 transition-shadow hover:shadow-[0_8px_24px_-12px_rgb(79_70_229/0.35)] hover:ring-brand-200"
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-white shadow-md ${field.tint}`}>
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
                          <dd
                            className={`truncate ${
                              value
                                ? field.key === "amount"
                                  ? "text-brand-gradient text-lg font-bold tabular-nums"
                                  : "text-[15px] font-semibold text-slate-900"
                                : "text-sm text-slate-400 italic"
                            }`}
                            title={value || undefined}
                          >
                            {value || t("extract.notFound")}
                          </dd>
                        </div>
                        {value && <CopyButton text={value} label={`${t("extract.copy")} — ${label}`} onCopy={copy} />}
                      </motion.div>
                    );
                  })}
                </motion.dl>

                {ocr && (
                  <div className="relative mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-500">{t("extract.confidence")}</span>
                      <span className="font-semibold text-slate-700 tabular-nums">{confidence}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        className={`h-full rounded-full bg-linear-to-r ${
                          confidence >= 85 ? "from-emerald-500 to-teal-400" : confidence >= 60 ? "from-amber-500 to-yellow-400" : "from-red-500 to-rose-400"
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${confidence}%` }}
                        transition={{ duration: 0.9, delay: 0.4, ease: EASE }}
                      />
                    </div>
                  </div>
                )}

                <div className="relative mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <CopyButton text={JSON.stringify(result.fields, null, 2)} label={t("extract.copyAll")} onCopy={copy} wide />
                  <motion.button type="button" whileTap={{ scale: 0.98 }} className="btn-ghost h-11 w-full ring-1 ring-slate-200" onClick={removeFile}>
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    {t("extract.newDocument")}
                  </motion.button>
                </div>

                <details className="group relative mt-4 overflow-hidden rounded-xl ring-1 ring-slate-200">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
                    {t("extract.debugTitle")}
                    <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="space-y-3 border-t border-slate-200 px-3.5 py-3">
                    {ocr && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-slate-500">
                          {t("extract.ocrText")} ·{" "}
                          {t("extract.ocrMeta", { regions: ocr.region_count, confidence, duration: ocr.duration_ms })}
                        </p>
                        <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-200">
                          {ocr.text}
                        </pre>
                      </div>
                    )}
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-500">
                        {t("extract.gptRaw")} · {t("extract.gptMeta", { model: result.model })}
                      </p>
                      <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-emerald-300">
                        {result.raw_response}
                      </pre>
                    </div>
                  </div>
                </details>
              </motion.section>
            ) : (
              <motion.section
                key="empty"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.5, delay: 0.26, ease: EASE }}
                className="card flex flex-col items-center gap-2 px-6 py-10 text-center"
              >
                <EmptyIllustration />
                <h3 className="mt-2 text-[15px] font-semibold text-slate-800">{t("extract.emptyTitle")}</h3>
                <p className="max-w-sm text-sm text-slate-500">{t("extract.emptyText")}</p>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
