"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Database, Loader2, MessageCircle, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { Shake } from "@/components/motion/Motion";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type ErrorCode = "upstream" | "not_configured" | "unauthorized" | "bad_request";

const EASE = [0.22, 1, 0.36, 1] as const;
const SUGGESTIONS = ["overdue", "toCollect", "topClients", "thisMonth"] as const;

/**
 * Floating database assistant, shown at the bottom start of every app page.
 * The conversation lives in this component, so it survives navigation between pages.
 */
export function ChatBubble() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, error]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(history: Message[]) {
    setMessages(history);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json().catch(() => ({ error: "upstream" }));
      if (!res.ok || typeof data.reply !== "string") {
        setError((data.error as ErrorCode) ?? "upstream");
      } else {
        setMessages([...history, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setError("upstream");
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function ask(question: string) {
    const content = question.trim();
    if (!content || pending) return;
    setInput("");
    send([...messages, { role: "user", content }]);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(input);
    }
  }

  function reset() {
    setMessages([]);
    setError(null);
    setInput("");
    inputRef.current?.focus();
  }

  return (
    <div className="fixed bottom-4 start-4 z-50 sm:bottom-6 sm:start-6 md:start-[calc(var(--sbw)+1.5rem)]">
      <AnimatePresence>
        {open && (
          <motion.section
            key="panel"
            role="dialog"
            aria-label={t("chat.title")}
            initial={{ opacity: 0, y: 18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.96 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="absolute start-0 bottom-[4.5rem] flex h-[min(36rem,calc(100dvh-7.5rem))] w-[min(24rem,calc(100vw-2rem))] origin-bottom-left flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-12px_rgb(30_27_75/0.35)] ring-1 ring-slate-900/5 rtl:origin-bottom-right"
          >
            <ChatHeader onReset={reset} onClose={() => setOpen(false)} canReset={messages.length > 0 || !!error} />

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-linear-to-b from-slate-50/80 to-white px-4 py-4">
              <AssistantBubble>{t("chat.greeting")}</AssistantBubble>

              {messages.length === 0 && !pending && <Suggestions onPick={ask} />}

              {messages.map((m, i) =>
                m.role === "user" ? (
                  <UserBubble key={i}>{m.content}</UserBubble>
                ) : (
                  <AssistantBubble key={i}>
                    <RichText text={m.content} />
                  </AssistantBubble>
                ),
              )}

              <AnimatePresence>{pending && <Thinking key="thinking" />}</AnimatePresence>

              {error && (
                <Shake className="flex items-start gap-2 rounded-2xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
                  <span className="flex-1">{t(`chat.errors.${error}`)}</span>
                  {error === "upstream" && (
                    <button
                      type="button"
                      onClick={() => send(messages)}
                      className="shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 transition hover:bg-rose-100"
                    >
                      {t("common.tryAgain")}
                    </button>
                  )}
                </Shake>
              )}
            </div>

            <form onSubmit={onSubmit} className="border-t border-slate-100 bg-white px-3 pt-3 pb-2">
              <div className="flex items-end gap-2 rounded-2xl bg-slate-50 p-1.5 ring-1 ring-slate-200 transition focus-within:bg-white focus-within:ring-4 focus-within:ring-brand-500/15">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  maxLength={2000}
                  placeholder={t("chat.placeholder")}
                  aria-label={t("chat.placeholder")}
                  className="field-sizing-content max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
                <motion.button
                  type="submit"
                  disabled={pending || !input.trim()}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.92 }}
                  aria-label={t("chat.send")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-lg shadow-brand-500/30 transition-opacity disabled:opacity-40 disabled:shadow-none"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <SendHorizontal className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
                  )}
                </motion.button>
              </div>
              <p className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-slate-400">
                <Database className="h-3 w-3" aria-hidden="true" />
                {t("chat.sourceNote")}
              </p>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <LauncherButton open={open} onToggle={() => setOpen((o) => !o)} />
    </div>
  );
}

function LauncherButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useLocale();
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? t("chat.close") : t("chat.open")}
      initial={{ opacity: 0, scale: 0.6, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.3 }}
      whileHover={{ scale: 1.07, y: -2 }}
      whileTap={{ scale: 0.93 }}
      className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-[0_10px_30px_-6px_rgb(79_70_229/0.6)] ring-4 ring-white/70 focus-visible:outline-none focus-visible:ring-brand-500/40"
    >
      {!open && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-brand-500"
          animate={{ scale: [1, 1.55], opacity: [0.35, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={open ? "close" : "open"}
          initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative"
        >
          {open ? <X className="h-6 w-6" aria-hidden="true" /> : <MessageCircle className="h-6 w-6" aria-hidden="true" />}
        </motion.span>
      </AnimatePresence>
      {!open && (
        <span className="absolute -end-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md">
          <Sparkles className="h-3 w-3 text-violet-600" aria-hidden="true" />
        </span>
      )}
    </motion.button>
  );
}

function ChatHeader({ onReset, onClose, canReset }: { onReset: () => void; onClose: () => void; canReset: boolean }) {
  const { t } = useLocale();
  return (
    <header className="relative overflow-hidden bg-brand-gradient px-4 py-4 text-white">
      <div aria-hidden="true" className="absolute -end-10 -top-12 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
      <div aria-hidden="true" className="absolute -bottom-14 start-10 h-28 w-28 rounded-full bg-fuchsia-400/30 blur-2xl" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight">{t("chat.title")}</h2>
          <p className="flex items-center gap-1.5 text-xs leading-snug text-white/80">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
            </span>
            {t("chat.subtitle")}
          </p>
        </div>
        <AnimatePresence>
          {canReset && (
            <motion.button
              type="button"
              onClick={onReset}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileTap={{ scale: 0.9 }}
              title={t("chat.newChat")}
              aria-label={t("chat.newChat")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/15 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </motion.button>
          )}
        </AnimatePresence>
        <motion.button
          type="button"
          onClick={onClose}
          whileTap={{ scale: 0.9 }}
          aria-label={t("chat.close")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/15 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </motion.button>
      </div>
    </header>
  );
}

const bubbleMotion = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.3, ease: EASE },
};

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <motion.div {...bubbleMotion} className="flex items-end gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white shadow-md shadow-brand-500/25">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-es-md bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-700 shadow-sm ring-1 ring-slate-900/5">
        {children}
      </div>
    </motion.div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <motion.div {...bubbleMotion} className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-ee-md bg-linear-to-br from-brand-600 to-violet-500 px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white shadow-md shadow-brand-500/25">
        {children}
      </div>
    </motion.div>
  );
}

function Suggestions({ onPick }: { onPick: (q: string) => void }) {
  const { t } = useLocale();
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } }}
      className="space-y-2 ps-9"
    >
      <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{t("chat.suggestionsTitle")}</p>
      {SUGGESTIONS.map((key) => (
        <motion.button
          key={key}
          type="button"
          variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE } } }}
          whileHover={{ x: 3 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onPick(t(`chat.suggestions.${key}`))}
          className="block w-full rounded-xl bg-white px-3 py-2 text-start text-sm text-brand-700 shadow-xs ring-1 ring-brand-100 transition-colors hover:bg-brand-50 hover:ring-brand-200"
        >
          {t(`chat.suggestions.${key}`)}
        </motion.button>
      ))}
    </motion.div>
  );
}

function Thinking() {
  const { t } = useLocale();
  return (
    <motion.div {...bubbleMotion} exit={{ opacity: 0, y: -4 }} className="flex items-end gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white shadow-md shadow-brand-500/25">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="flex items-center gap-2.5 rounded-2xl rounded-es-md bg-white px-3.5 py-3 shadow-sm ring-1 ring-slate-900/5" role="status">
        <span className="flex gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-brand-500"
              animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </span>
        <span className="text-xs text-slate-500">{t("chat.thinking")}</span>
      </div>
    </motion.div>
  );
}

/** Minimal, safe rendering of the model's replies: paragraphs, "- " lists and **bold**. */
function RichText({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    const list = !!item;
    const last = blocks[blocks.length - 1];
    if (last && last.list === list && list) last.lines.push(item![1]);
    else blocks.push({ list, lines: [list ? item![1] : line] });
  }
  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i} className="space-y-1">
            {b.lines.map((l, j) => (
              <li key={j} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
                <span>
                  <Inline text={l} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inline text={b.lines[0]} />
          </p>
        ),
      )}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
