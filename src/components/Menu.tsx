"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** A button that opens a small card of actions — the "⋯" on a row, or "More"
 * on the selection bar. Clicking any item marked `data-close` shuts it. */
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
  /** Open above the button — for the bar pinned to the bottom of the screen. */
  up?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-close]")) setOpen(false);
          }}
          className={`card absolute z-40 min-w-52 p-1.5 text-ink ${
            align === "right" ? "right-0" : "left-0"
          } ${up ? "bottom-full mb-2" : "top-full mt-2"}`}
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
