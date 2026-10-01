"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale } from "@/i18n/client";
import { AssistantIcon } from "@/components/assistant/AssistantIcon";

const STORAGE_KEY = "erp:assistant-launcher";
const SIZE = 60;
const MARGIN = 12;
const DRAG_THRESHOLD = 5;
const KEY_STEP = 24;

/** Position as fractions of the viewport, so it survives window resizes. */
interface StoredPosition {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function defaultPosition(rtl: boolean) {
  const footer = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--footer-h")) * 16 || 56;
  return {
    left: rtl ? MARGIN + 8 : window.innerWidth - SIZE - MARGIN - 8,
    top: window.innerHeight - footer - SIZE - MARGIN,
  };
}

/**
 * Floating document-assistant button that the user can drag anywhere on screen (mouse,
 * touch or arrow keys). A click without movement toggles the assistant panel.
 */
export const AssistantLauncher = forwardRef<
  HTMLButtonElement,
  { panelId: string; expanded: boolean; onToggle: () => void }
>(function AssistantLauncher({ panelId, expanded, onToggle }, ref) {
  const { t, dir } = useLocale();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startY: number; left: number; top: number; moved: boolean } | null>(null);
  // Set when a drag ends, so the click the browser fires right after it doesn't toggle the panel.
  const suppressClick = useRef(false);

  const place = useCallback((left: number, top: number, persist: boolean) => {
    const next = {
      left: clamp(left, MARGIN, window.innerWidth - SIZE - MARGIN),
      top: clamp(top, MARGIN, window.innerHeight - SIZE - MARGIN),
    };
    setPos(next);
    if (persist) {
      try {
        const stored: StoredPosition = { x: next.left / window.innerWidth, y: next.top / window.innerHeight };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch {
        // localStorage unavailable, ignore.
      }
    }
  }, []);

  // Restore the saved spot (or the default corner) after mount, and keep it on screen on resize.
  useEffect(() => {
    function restore() {
      let saved: StoredPosition | null = null;
      try {
        saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as StoredPosition | null;
      } catch {
        saved = null;
      }
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        place(saved.x * window.innerWidth, saved.y * window.innerHeight, false);
      } else {
        const d = defaultPosition(dir === "rtl");
        place(d.left, d.top, false);
      }
    }
    restore();
    window.addEventListener("resize", restore);
    return () => window.removeEventListener("resize", restore);
  }, [dir, place]);

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !pos) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startY: event.clientY, left: pos.left, top: pos.top, moved: false };
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    place(d.left + dx, d.top + dy, false);
  }

  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!d) return;
    if (d.moved) {
      suppressClick.current = true;
      setDragging(false);
      place(d.left + event.clientX - d.startX, d.top + event.clientY - d.startY, true);
    }
  }

  function onClick() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onToggle();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!pos) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      place(pos.left + move[0], pos.top + move[1], true);
    }
  }

  return (
    <AnimatePresence>
      {pos && (
        <motion.button
          ref={ref}
          type="button"
          aria-label={expanded ? `${t("common.close")} — ${t("assistant.title")}` : t("assistant.open")}
          aria-description={t("assistant.moveHint")}
          aria-expanded={expanded}
          aria-controls={panelId}
          title={`${t("assistant.title")} — ${t("assistant.moveHint")}`}
          onClick={onClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onKeyDown={onKeyDown}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: dragging ? 1.12 : 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          whileHover={dragging ? undefined : { scale: 1.06 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
          style={{ left: pos.left, top: pos.top, width: SIZE, height: SIZE }}
          className={`group fixed z-40 touch-none rounded-full select-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/60 ${
            dragging
              ? "cursor-grabbing shadow-[0_18px_40px_-8px_rgb(14_116_244/0.75)]"
              : "cursor-grab shadow-[0_10px_28px_-8px_rgb(14_116_244/0.65)]"
          }`}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-sky-400/40 motion-safe:animate-ping [animation-duration:2.4s] [animation-iteration-count:3]"
          />
          <span className="relative block h-full w-full overflow-hidden rounded-full ring-2 ring-white/90">
            <AssistantIcon className="h-full w-full" />
          </span>
          <span
            aria-hidden="true"
            className="absolute end-0.5 top-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white"
          />
        </motion.button>
      )}
    </AnimatePresence>
  );
});
