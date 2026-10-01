"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowUp, Check, Copy, RotateCcw, SquarePen, X } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { AssistantMarkdown } from "@/components/assistant/AssistantMarkdown";
import { AssistantIcon } from "@/components/assistant/AssistantIcon";

const STORAGE_KEY = "erp:assistant";
const MAX_QUESTION_LENGTH = 4000;
// Sentence the workflow answers with when the documents don't cover the question
// (older conversations may hold the English one from before replies were localized).
const NOT_FOUND_FALLBACK = "couldn't find this information";
const EASE = [0.22, 1, 0.36, 1] as const;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: string;
  /** Set on a failed answer: the question to send again. */
  retryOf?: string;
}

interface StoredConversation {
  sessionId: string;
  messages: ChatMessage[];
}

function newId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadConversation(): StoredConversation | null {
  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as StoredConversation) : null;
  } catch {
    return null;
  }
}

/**
 * Document assistant chat panel backed by /api/assistant. Opened from the footer button;
 * the conversation lives in this component, so it survives page navigation.
 */
export function AssistantPanel({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const { t, locale } = useLocale();
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const inputId = useId();

  // Restore the conversation of this browser tab (it survives reloads, not new tabs).
  useEffect(() => {
    const saved = loadConversation();
    // One-time hydration from sessionStorage on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionId(saved?.sessionId ?? newId());
    if (saved?.messages?.length) setMessages(saved.messages);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, messages }));
    } catch {
      // sessionStorage unavailable, ignore.
    }
  }, [sessionId, messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const timeNow = () =>
    new Date().toLocaleTimeString(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit" });

  async function ask(question: string, { addUserMessage = true } = {}) {
    const text = question.trim();
    if (!text || busy || !sessionId) return;
    if (addUserMessage) {
      setMessages((current) => [...current, { id: newId(), role: "user", text, time: timeNow() }]);
    }
    setDraft("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, sessionId }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      if (!res.ok || !data.answer) throw new Error(data.error ?? "upstream");
      setMessages((current) => [...current, { id: newId(), role: "assistant", text: data.answer!, time: timeNow() }]);
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = error instanceof Error ? error.message : "upstream";
      const key = code === "timeout" ? "assistant.errorTimeout" : code === "not_configured" ? "assistant.errorNotConfigured" : "assistant.errorGeneric";
      setMessages((current) => [
        ...current,
        { id: newId(), role: "assistant", text: t(key), time: timeNow(), retryOf: text },
      ]);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  }

  function retry(message: ChatMessage) {
    setMessages((current) => current.filter((m) => m.id !== message.id));
    void ask(message.retryOf!, { addUserMessage: false });
  }

  function startNewConversation() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setMessages([]);
    setDraft("");
    setSessionId(newId());
    inputRef.current?.focus();
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask(draft);
    }
  }

  // Grow the textarea with its content, up to ~6 lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft, open]);

  const suggestions = [t("assistant.suggestion1"), t("assistant.suggestion2"), t("assistant.suggestion3")];

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.section
            id={id}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
            }}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.16 } }}
            transition={{ duration: 0.32, ease: EASE }}
            className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white sm:inset-auto sm:end-6 sm:bottom-[calc(var(--footer-h)+0.75rem)] sm:h-[min(680px,calc(100dvh-var(--footer-h)-5.5rem))] sm:w-[420px] sm:origin-bottom-right sm:rounded-3xl sm:shadow-[0_24px_64px_-12px_rgb(15_23_42/0.35)] sm:ring-1 sm:ring-slate-900/10 rtl:sm:origin-bottom-left"
          >
            {/* Header */}
            <header className="bg-brand-gradient relative flex shrink-0 items-center gap-3 overflow-hidden px-4 py-3.5 text-white">
              <div aria-hidden="true" className="pointer-events-none absolute -end-10 -top-16 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-2 ring-white/40">
                <AssistantIcon className="h-10 w-10" />
              </span>
              <div className="relative min-w-0 flex-1">
                <h2 id={titleId} className="truncate text-[15px] leading-tight font-semibold">
                  {t("assistant.title")}
                </h2>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-white/80">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_0_3px_rgb(110_231_183/0.3)]" aria-hidden="true" />
                  {t("assistant.subtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={startNewConversation}
                disabled={!messages.length && !busy}
                aria-label={t("assistant.newChat")}
                title={t("assistant.newChat")}
                className="relative flex h-10 w-10 items-center justify-center rounded-xl text-white/85 transition hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"
              >
                <SquarePen className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                title={t("common.close")}
                className="relative flex h-10 w-10 items-center justify-center rounded-xl text-white/85 transition hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            {/* Conversation */}
            <div
              ref={scrollRef}
              aria-live="polite"
              aria-busy={busy}
              aria-label={t("assistant.conversation")}
              className="flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5"
            >
              {messages.length === 0 && !busy ? (
                <div className="flex h-full flex-col items-center justify-center px-2 text-center">
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
                    className="flex h-16 w-16 items-center justify-center rounded-full shadow-lg shadow-sky-500/30"
                  >
                    <AssistantIcon className="h-16 w-16" />
                  </motion.span>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{t("assistant.welcomeTitle")}</h3>
                  <p className="mt-1.5 max-w-xs text-sm text-slate-500">{t("assistant.welcomeText")}</p>
                  <ul className="mt-6 flex w-full flex-col gap-2">
                    {suggestions.map((suggestion, i) => (
                      <motion.li
                        key={suggestion}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.06, duration: 0.3, ease: EASE }}
                      >
                        <button
                          type="button"
                          onClick={() => void ask(suggestion)}
                          className="w-full rounded-xl bg-white px-4 py-3 text-start text-sm text-slate-700 shadow-xs ring-1 ring-slate-200 transition hover:-translate-y-px hover:text-brand-700 hover:ring-brand-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
                        >
                          {suggestion}
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              ) : (
                <ol className="flex flex-col gap-4">
                  {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} onRetry={() => retry(message)} />
                  ))}
                  {busy && (
                    <li className="flex items-center gap-2" aria-label={t("assistant.thinking")}>
                      <span className="flex items-center gap-1 rounded-2xl rounded-ss-md bg-white px-4 py-3.5 shadow-xs ring-1 ring-slate-200">
                        {[0, 1, 2].map((dot) => (
                          <span
                            key={dot}
                            className="h-1.5 w-1.5 rounded-full bg-brand-400 motion-safe:animate-bounce"
                            style={{ animationDelay: `${dot * 0.15}s` }}
                          />
                        ))}
                      </span>
                      <span className="text-xs text-slate-500">{t("assistant.thinking")}</span>
                    </li>
                  )}
                </ol>
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void ask(draft);
              }}
              className="shrink-0 border-t border-slate-200/80 bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-end gap-2 rounded-2xl bg-slate-100/80 p-1.5 ring-1 ring-transparent transition focus-within:bg-white focus-within:ring-brand-300 focus-within:shadow-[0_0_0_4px_rgb(99_102_241/0.12)]">
                <label htmlFor={inputId} className="sr-only">
                  {t("assistant.inputLabel")}
                </label>
                <textarea
                  id={inputId}
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  maxLength={MAX_QUESTION_LENGTH}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder={t("assistant.placeholder")}
                  className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || busy}
                  aria-label={t("assistant.send")}
                  className="bg-brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md shadow-brand-500/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
                >
                  <ArrowUp className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 hidden text-center text-[11px] text-slate-500 sm:block">{t("assistant.hint")}</p>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

function MessageBubble({ message, onRetry }: { message: ChatMessage; onRetry: () => void }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isError = Boolean(message.retryOf);
  const text = message.text.toLowerCase();
  const notFound =
    !isUser &&
    !isError &&
    (text.includes(t("assistant.notFound").toLowerCase().replace(/\.$/, "")) || text.includes(NOT_FOUND_FALLBACK));

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (insecure context), ignore.
    }
  }

  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
    >
      <span className="sr-only">{isUser ? t("assistant.you") : t("assistant.title")}</span>
      <div
        className={
          isUser
            ? "bg-brand-gradient max-w-[85%] rounded-2xl rounded-se-md px-4 py-2.5 text-sm whitespace-pre-wrap text-white shadow-md shadow-brand-500/20"
            : `assistant-prose max-w-[92%] rounded-2xl rounded-ss-md px-4 py-3 text-sm shadow-xs ring-1 ${
                isError
                  ? "bg-rose-50 text-rose-800 ring-rose-200"
                  : notFound
                    ? "bg-amber-50 text-amber-900 ring-amber-200"
                    : "bg-white text-slate-700 ring-slate-200"
              }`
        }
      >
        {isUser ? (
          message.text
        ) : isError ? (
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{message.text}</span>
          </p>
        ) : (
          <AssistantMarkdown text={message.text} />
        )}
      </div>
      <div className="mt-1 flex items-center gap-1 px-1 text-[11px] text-slate-500">
        <time>{message.time}</time>
        {!isUser && !isError && (
          <button
            type="button"
            onClick={copy}
            className="ms-1 inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 transition hover:bg-slate-200/70 hover:text-slate-700"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? t("assistant.copied") : t("assistant.copy")}
          </button>
        )}
        {isError && (
          <button
            type="button"
            onClick={onRetry}
            className="ms-1 inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 font-medium text-rose-700 transition hover:bg-rose-100"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("common.tryAgain")}
          </button>
        )}
      </div>
    </motion.li>
  );
}
