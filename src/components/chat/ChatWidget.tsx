"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, MessageSquareText, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { CHAT_MAX_MESSAGES, CHAT_MAX_MESSAGE_LENGTH, type ChatStreamEvent } from "@/lib/ai/chat-protocol";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Outil en cours d'execution (affiche pendant la generation). */
  activeTool?: string;
  /** Cle de traduction d'une erreur survenue pendant la reponse. */
  errorKey?: string;
  pending?: boolean;
};

const TOOL_LABEL_KEYS: Record<string, string> = {
  resume_activite: "chat.toolResumeActivite",
  lister_factures: "chat.toolListerFactures",
  obtenir_facture: "chat.toolObtenirFacture",
  top_clients: "chat.toolTopClients",
  statistiques_devis: "chat.toolStatistiquesDevis",
  lister_devis: "chat.toolListerDevis",
  lister_paiements: "chat.toolListerPaiements",
  lister_avoirs: "chat.toolListerAvoirs",
  rechercher_clients: "chat.toolRechercherClients",
  rechercher_produits: "chat.toolRechercherProduits",
  produits_plus_vendus: "chat.toolProduitsPlusVendus",
};

const STREAM_ERROR_KEYS: Record<Extract<ChatStreamEvent, { type: "error" }>["code"], string> = {
  incomplete: "chat.errorIncomplete",
  upstream: "chat.errorUpstream",
  too_many_steps: "chat.errorTooManySteps",
};

const SUGGESTION_KEYS = [
  "chat.suggestion1",
  "chat.suggestion2",
  "chat.suggestion3",
  "chat.suggestion4",
  "chat.suggestion5",
  "chat.suggestion6",
];

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChatWidget() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();

  const updateAssistant = useCallback((id: string, update: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? update(m) : m)));
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 150);
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const resizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  async function send(question: string) {
    const content = question.trim().slice(0, CHAT_MAX_MESSAGE_LENGTH);
    if (!content || streaming) return;

    const userMessage: ChatMessage = { id: newId(), role: "user", content };
    const assistantId = newId();
    const history = [...messages, userMessage]
      .filter((m) => !m.errorKey && m.content.trim() !== "")
      .map((m) => ({ role: m.role, content: m.content.slice(0, CHAT_MAX_MESSAGE_LENGTH) }))
      .slice(-CHAT_MAX_MESSAGES);
    // L'historique envoye doit commencer par un message utilisateur.
    while (history.length > 1 && history[0].role !== "user") history.shift();

    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", content: "", pending: true }]);
    setDraft("");
    requestAnimationFrame(resizeInput);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      const isStream = response.headers.get("content-type")?.includes("application/x-ndjson");
      if (response.status === 401 || response.redirected || (response.ok && !isStream)) {
        throw new ChatError("chat.errorUnauthorized");
      }
      if (response.status === 503) throw new ChatError("chat.errorNotConfigured");
      if (!response.ok || !response.body) throw new ChatError("chat.errorGeneric");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handle = (event: ChatStreamEvent) => {
        if (event.type === "text") {
          updateAssistant(assistantId, (m) => ({ ...m, content: m.content + event.delta, activeTool: undefined }));
        } else if (event.type === "tool") {
          updateAssistant(assistantId, (m) => ({ ...m, activeTool: event.name }));
        } else if (event.type === "error") {
          updateAssistant(assistantId, (m) => ({ ...m, errorKey: STREAM_ERROR_KEYS[event.code] }));
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) handle(JSON.parse(line) as ChatStreamEvent);
        }
      }
      if (buffer.trim()) handle(JSON.parse(buffer) as ChatStreamEvent);
    } catch (error) {
      const errorKey =
        error instanceof ChatError
          ? error.key
          : error instanceof DOMException && error.name === "AbortError"
            ? "chat.stopped"
            : "chat.errorGeneric";
      updateAssistant(assistantId, (m) => ({ ...m, errorKey }));
    } finally {
      updateAssistant(assistantId, (m) => ({ ...m, pending: false, activeTool: undefined }));
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  }

  function resetConversation() {
    abortRef.current?.abort();
    setMessages([]);
    setDraft("");
    inputRef.current?.focus();
  }

  function closeOnSmallScreens() {
    if (window.matchMedia("(max-width: 639px)").matches) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("chat.open")}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`fixed bottom-5 end-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-700 to-brand-800 text-white shadow-lg shadow-brand-800/25 ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-800/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40 active:scale-95 ${
          open ? "pointer-events-none scale-75 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </button>

      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        inert={!open}
        className={`fixed inset-0 z-50 flex flex-col overflow-hidden bg-white transition-all duration-200 ease-out sm:inset-auto sm:bottom-5 sm:end-5 sm:h-[min(640px,calc(100dvh-2.5rem))] sm:w-[420px] sm:rounded-[var(--radius-card)] sm:border sm:border-neutral-200 sm:shadow-2xl sm:shadow-neutral-900/10 ${
          open
            ? "visible translate-y-0 opacity-100 sm:scale-100"
            : "invisible translate-y-4 opacity-0 sm:scale-95"
        } origin-bottom-right rtl:origin-bottom-left`}
      >
        <header className="flex items-center gap-3 border-b border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-700 to-brand-600 text-white shadow-sm">
            <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <h2 id={titleId} className="text-sm font-semibold text-neutral-900">
              {t("chat.title")}
            </h2>
            <p className="truncate text-xs text-neutral-500">{t("chat.subtitle")}</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={resetConversation}
              aria-label={t("chat.newConversation")}
              title={t("chat.newConversation")}
              className="rounded-md p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("chat.close")}
            title={t("chat.close")}
            className="rounded-md p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <MessageSquareText className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-neutral-900">{t("chat.emptyTitle")}</h3>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-neutral-500">{t("chat.emptyDescription")}</p>
              <div className="mt-5 w-full">
                <p className="mb-2 text-start text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  {t("chat.suggestionsLabel")}
                </p>
                <ul className="grid gap-2">
                  {SUGGESTION_KEYS.map((key) => (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => void send(t(key))}
                        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-start text-sm text-neutral-700 transition-all hover:-translate-y-px hover:border-brand-500/50 hover:bg-brand-50 hover:text-neutral-900 hover:shadow-sm"
                      >
                        {t(key)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <ol className="space-y-4">
              {messages.map((message) =>
                message.role === "user" ? (
                  <li key={message.id} className="flex justify-end">
                    <span className="sr-only">{t("chat.you")} :</span>
                    <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-md bg-brand-700 px-3.5 py-2 text-sm text-white shadow-sm">
                      {message.content}
                    </p>
                  </li>
                ) : (
                  <li key={message.id} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 max-w-[85%] flex-1 space-y-2 text-sm leading-relaxed text-neutral-700">
                      <span className="sr-only">{t("chat.assistant")} :</span>
                      {message.content && <ChatMessageContent text={message.content} onNavigate={closeOnSmallScreens} />}
                      {message.pending && (
                        <p className="flex items-center gap-2 text-xs text-neutral-500">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          {message.activeTool
                            ? t(TOOL_LABEL_KEYS[message.activeTool] ?? "chat.toolDefault")
                            : message.content
                              ? null
                              : t("chat.thinking")}
                        </p>
                      )}
                      {message.errorKey && (
                        <p
                          role="alert"
                          className={`rounded-lg px-3 py-2 text-xs ${
                            message.errorKey === "chat.stopped"
                              ? "bg-neutral-50 text-neutral-500"
                              : "border border-red-100 bg-red-50 text-red-700"
                          }`}
                        >
                          {t(message.errorKey)}
                        </p>
                      )}
                    </div>
                  </li>
                ),
              )}
            </ol>
          )}
        </div>

        <form onSubmit={onSubmit} className="border-t border-neutral-200 bg-white px-3 pb-3 pt-3">
          <div className="flex items-end gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-1.5 transition-colors focus-within:border-brand-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/30">
            <label htmlFor={`${titleId}-input`} className="sr-only">
              {t("chat.placeholder")}
            </label>
            <textarea
              id={`${titleId}-input`}
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={CHAT_MAX_MESSAGE_LENGTH}
              onChange={(event) => {
                setDraft(event.target.value);
                resizeInput();
              }}
              onKeyDown={onInputKeyDown}
              placeholder={t("chat.placeholder")}
              className="max-h-32 min-h-9 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
            />
            {streaming ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label={t("chat.stop")}
                title={t("chat.stop")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white transition-transform hover:bg-neutral-700 active:scale-95"
              >
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label={t("chat.send")}
                title={t("chat.send")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white transition-all hover:bg-brand-800 active:scale-95 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="mt-2 px-1 text-center text-[11px] text-neutral-400">{t("chat.disclaimer")}</p>
        </form>
      </section>
    </>
  );
}

class ChatError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}
