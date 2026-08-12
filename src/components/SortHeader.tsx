"use client";

import type { SortDir } from "@/lib/sort";

export default function SortHeader<K extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: K;
  activeKey: K | null;
  dir: SortDir;
  onSort: (key: K) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const active = activeKey === sortKey;
  const justify =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";
  const alignCls =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";

  return (
    <th className={`px-4 py-3 ${alignCls} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex w-full items-center gap-1 uppercase tracking-wide hover:text-zinc-700 dark:hover:text-zinc-300 ${justify}`}
      >
        {label}
        <span className={active ? "" : "text-zinc-300 dark:text-zinc-600"}>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
