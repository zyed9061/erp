"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Rendu minimal et sur des reponses de l'assistant : paragraphes, listes a puces
 * ou numerotees, **gras** et liens internes [texte](/chemin). Aucun HTML brut
 * n'est interprete ; les liens externes sont affiches comme du texte.
 */
export function ChatMessageContent({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{renderInline(item, onNavigate)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length} className="list-decimal space-y-1 ps-5">
          {items}
        </ol>
      ) : (
        <ul key={blocks.length} className="list-disc space-y-1 ps-5 marker:text-neutral-400">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (bullet || numbered) {
      const ordered = Boolean(numbered && !bullet);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    flushList();
    if (line.trim() === "") continue;
    blocks.push(<p key={blocks.length}>{renderInline(line, onNavigate)}</p>);
  }
  flushList();

  return <div className="space-y-2 break-words">{blocks}</div>;
}

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, onNavigate?: () => void): ReactNode[] {
  return text.split(INLINE_PATTERN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-neutral-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      // Seuls les chemins internes de l'application sont rendus cliquables.
      if (href.startsWith("/") && !href.startsWith("//")) {
        return (
          <Link
            key={i}
            href={href}
            onClick={onNavigate}
            className="font-medium text-brand-700 underline decoration-brand-500/40 underline-offset-2 hover:decoration-brand-700"
          >
            {label}
          </Link>
        );
      }
      return <span key={i}>{label}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}
