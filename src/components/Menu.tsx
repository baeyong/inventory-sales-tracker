"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Space kept between the button and the open card, and from the screen edge. */
const GAP = 8;

/** A button that opens a small card of actions — the "⋯" on a row, or "More"
 * on the selection bar. Clicking any item marked `data-close` shuts it.
 *
 * The open card is positioned against the screen (fixed), not its parent, so
 * a scrolling table can't clip it: on the last row it used to hang below the
 * table and turn into a scrollbar. It opens below the button, or above when
 * there isn't room. */
export default function Menu({
  label,
  buttonClass,
  buttonContent,
  align = "right",
  up = false,
  children,
}: {
  /** Accessible name for the button. */
  label: string;
  buttonClass: string;
  buttonContent: ReactNode;
  align?: "left" | "right";
  /** Prefer opening above the button — for the bar pinned to the bottom of
   * the screen. It still flips if there's no room. */
  up?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Place the card next to the button, flipping up or down to fit, and keep
  // it there while the page or a table scrolls. Writes the style directly so
  // there's no extra render (and no flash in the wrong spot).
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const button = buttonRef.current;
      const panel = panelRef.current;
      if (!button || !panel) return;
      const b = button.getBoundingClientRect();
      const h = panel.offsetHeight;
      const w = panel.offsetWidth;
      const below = window.innerHeight - b.bottom - GAP;
      const above = b.top - GAP;
      const goUp = up ? above >= h || above > below : below < h && above > below;
      const top = goUp ? b.top - GAP - h : b.bottom + GAP;
      let left = align === "right" ? b.right - w : b.left;
      left = Math.min(Math.max(left, GAP), window.innerWidth - w - GAP);
      panel.style.top = `${Math.max(top, GAP)}px`;
      panel.style.left = `${left}px`;
      panel.style.visibility = "visible";
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true); // capture: tables scroll too
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align, up]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={buttonClass}
      >
        {buttonContent}
      </button>
      {open && (
        <div
          ref={panelRef}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-close]")) setOpen(false);
          }}
          // Hidden until placed, so it never shows at the wrong spot.
          style={{ top: 0, left: 0, visibility: "hidden" }}
          className="card fixed z-50 max-h-[calc(100vh-16px)] min-w-52 overflow-y-auto p-1.5 text-ink"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** One row in a Menu. */
export const menuItem =
  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-ink-2 hover:bg-inset disabled:opacity-50";

export function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="3" r="1.3" fill="currentColor" />
      <circle cx="7" cy="7" r="1.3" fill="currentColor" />
      <circle cx="7" cy="11" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function ChevronDown() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M1 3.5 L5 7 L9 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The "⋯" button style used on table rows. */
export const rowMenuButton =
  "inline-flex h-[31px] w-[31px] items-center justify-center rounded-[9px] bg-inset text-muted hover:bg-line hover:text-ink";
