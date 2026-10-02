import { Fragment, type ReactNode } from "react";

/**
 * Minimal Markdown renderer for assistant answers: paragraphs, bullet/numbered lists,
 * quotes, **bold**, *italic* and `code`. Builds React elements (never raw HTML), so
 * model output cannot inject markup.
 */
export function AssistantMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  // Widened with `as` so TypeScript does not narrow it to `null` (it is reassigned in closures).
  let list = null as { type: "ul" | "ol"; items: string[] } | null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const lines = paragraph;
    blocks.push(
      <p key={blocks.length}>
        {lines.map((line, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {renderInline(line)}
          </Fragment>
        ))}
      </p>,
    );
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const { type, items } = list;
    const Tag = type;
    blocks.push(
      <Tag key={blocks.length} className={type === "ul" ? "list-disc" : "list-decimal"}>
        {items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  for (const raw of text.trim().split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)/);
    const numbered = line.match(/^\d+[.)]\s+(.*)/);
    const quote = line.match(/^>\s?(.*)/);

    if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? "ul" : "ol";
      if (list?.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list!.items.push((bullet ?? numbered)![1]);
    } else if (quote) {
      flushParagraph();
      flushList();
      blocks.push(<blockquote key={blocks.length}>{renderInline(quote[1])}</blockquote>);
    } else if (!line) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.replace(/^#{1,6}\s+/, ""));
    }
  }
  flushParagraph();
  flushList();

  return <>{blocks}</>;
}

const INLINE_PATTERN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE_PATTERN).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
