"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const inputCls =
  "rounded-full border-0 bg-surface py-2.5 pl-4 pr-8 text-xs font-medium text-ink-2 shadow-pill";
const dateCls =
  "rounded-full border-0 bg-surface px-3.5 py-2 text-xs font-medium text-ink-2 shadow-pill";

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
    <div className="contents text-xs">
      {showDates && (
        <>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setParam("from", e.target.value)}
              className={dateCls}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setParam("to", e.target.value)}
              className={dateCls}
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
          className="text-[13px] text-ink-2 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
