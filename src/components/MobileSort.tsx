"use client";

import type { SortDir } from "@/lib/sort";

// Sort control for the mobile card views, which have no column headers to
// click. A dropdown picks the field; the arrow button flips direction.
export default function MobileSort<K extends string>({
  options,
  activeKey,
  dir,
  onSort,
}: {
  options: { key: K; label: string }[];
  activeKey: K | null;
  dir: SortDir;
  onSort: (key: K) => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 md:hidden">
      <span className="text-sm text-muted">Sort</span>
      <select
        value={activeKey ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onSort(v as K);
        }}
        className="rounded-md border border-edge px-2 py-1.5 text-sm"
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
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-edge text-muted hover:bg-inset disabled:opacity-40"
      >
        {dir === "asc" ? "↑" : "↓"}
      </button>
    </div>
  );
}
