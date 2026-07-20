"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const inputCls =
  "rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export default function FilterBar({
  categories,
  showDates = false,
  showListed = false,
}: {
  categories: string[];
  showDates?: boolean;
  showListed?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const category = sp.get("category") ?? "";
  const listed = sp.get("listed") ?? "";
  const active = Boolean(from || to || category || listed);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {showDates && (
        <>
          <label className="flex items-center gap-1 text-zinc-500">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setParam("from", e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex items-center gap-1 text-zinc-500">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setParam("to", e.target.value)}
              className={inputCls}
            />
          </label>
        </>
      )}
      <select
        value={category}
        onChange={(e) => setParam("category", e.target.value)}
        aria-label="Filter by category"
        className={inputCls}
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {showListed && (
        <select
          value={listed}
          onChange={(e) => setParam("listed", e.target.value)}
          aria-label="Filter by listed status"
          className={inputCls}
        >
          <option value="">Listed & unlisted</option>
          <option value="no">Not listed yet</option>
          <option value="yes">Listed</option>
        </select>
      )}
      {active && (
        <button
          type="button"
          onClick={() => router.replace(pathname)}
          className="text-zinc-500 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
