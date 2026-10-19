"use client";

import type { SortDir } from "@/lib/sort";

// Sort control for the mobile card views, which have no column headers to
// click. A dropdown picks the field; the arrow button flips direction.
export default function MobileSort<K extends string>({
  options,
  activeKey,
  dir,
  onSort,
  always = false,
}: {
  options: { key: K; label: string }[];
  activeKey: K | null;
  dir: SortDir;
  onSort: (key: K) => void;
  /** Show at every width, for lists without clickable column headers. */
  always?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${always ? "" : "md:hidden"}`}>
      <span className="text-xs text-muted">Sort</span>
      <select
        value={activeKey ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onSort(v as K);
        }}
        className="rounded-full border-0 bg-surface py-2.5 pl-4 pr-8 text-xs font-medium text-ink-2 shadow-pill"
      >
        <option value="" disabled>
          Choose…
        </option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => activeKey && onSort(activeKey)}
        disabled={!activeKey}
        aria-label={dir === "asc" ? "Ascending" : "Descending"}
        title={dir === "asc" ? "Ascending — tap to flip" : "Descending — tap to flip"}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-2 shadow-pill hover:bg-inset disabled:opacity-40"
      >
        {dir === "asc" ? "↑" : "↓"}
      </button>
    </div>
  );
}
