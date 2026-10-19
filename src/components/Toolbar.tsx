"use client";

import type { ReactNode } from "react";

/** Rounded search box with a magnifier, as in the mocks' toolbars. */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative inline-flex w-full max-w-[320px] flex-[1_1_250px] items-center">
      <span
        className="pointer-events-none absolute left-[13px] inline-flex text-muted"
        aria-hidden="true"
      >
        <svg width="15" height="15" viewBox="0 0 15 15">
          <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 10 L13.5 13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <span className="sr-only">{placeholder.replace(/…$/, "")}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border-0 bg-surface py-[11px] pl-9 pr-3.5 text-[13px] text-ink shadow-pill placeholder:text-muted"
      />
    </label>
  );
}

/** "3 of 40 shown · clear" under an active search. */
export function SearchCount({
  shown,
  total,
  onClear,
}: {
  shown: number;
  total: number;
  onClear: () => void;
}) {
  return (
    <span className="text-[13px] text-muted">
      {shown} of {total} shown ·{" "}
      <button type="button" onClick={onClear} className="hover:underline">
        clear
      </button>
    </span>
  );
}

/** The row of search, filters and the page action above a list. */
export function ToolbarRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-[9px]">{children}</div>;
}

/** The floating dark bar for a selection; it sits over the bottom of the list
 * so the page never shifts when you tick something. */
export function SelectionDock({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none sticky bottom-[22px] z-30 mt-4 flex justify-center">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-[9px] rounded-[28px] bg-dock px-3.5 py-[11px] text-white shadow-dock sm:pl-5">
        {children}
      </div>
    </div>
  );
}

export const dockPrimary =
  "rounded-full bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#0f2740] hover:bg-[#e8f0f9] disabled:opacity-50";
export const dockButton =
  "inline-flex items-center gap-[7px] rounded-full bg-dock-2 px-3.5 py-[9px] text-[13px] text-white hover:bg-dock-line disabled:opacity-50";
export const dockClear =
  "px-2.5 py-[9px] text-[13px] text-dock-muted underline hover:text-white";
export const dockDivider = "mx-1 hidden h-[22px] w-px bg-dock-line sm:block";
