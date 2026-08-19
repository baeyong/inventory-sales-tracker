"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkMarkUnopened } from "@/app/(app)/actions";
import { formatDate, formatMoney, isCardCategory, type Item } from "@/lib/types";
import { matchesSearch } from "@/lib/search";
import { sortItems, type SortDir, type SortKey } from "@/lib/sort";
import SortHeader from "@/components/SortHeader";
import MobileSort from "@/components/MobileSort";

export default function RippedTable({ items }: { items: Item[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visible = sortItems(
    items.filter((i) => matchesSearch(i, search)),
    sortKey,
    sortDir
  );

  function undo(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await bulkMarkUnopened([id]);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search opened product…"
          className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm sm:w-64 dark:border-zinc-700 dark:bg-zinc-950"
        />
        {search && (
          <span className="text-sm text-zinc-500">
            {visible.length} of {items.length} shown
            {" · "}
            <button
              type="button"
              onClick={() => setSearch("")}
              className="hover:underline"
            >
              clear
            </button>
          </span>
        )}
        {error && (
          <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
        )}
      </div>

      <MobileSort
        options={[
          { key: "name", label: "Product" },
          { key: "category", label: "Type" },
          { key: "purchase_platform", label: "Bought at" },
          { key: "purchase_date", label: "Purchased" },
          { key: "purchase_price", label: "Cost" },
          { key: "opened_at", label: "Opened" },
        ]}
        activeKey={sortKey}
        dir={sortDir}
        onSort={toggleSort}
      />

      {/* Mobile: stacked cards */}
      <ul className="space-y-3 md:hidden">
        {visible.map((item) => (
          <li
            key={item.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/inventory/${item.id}`}
                className="font-medium hover:underline"
              >
                {item.name}
              </Link>
              <span
                className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                  isCardCategory(item.category)
                    ? "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {item.category}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="font-medium">
                {formatMoney(Number(item.purchase_price))}
              </span>
              {item.purchase_platform && (
                <span className="text-zinc-500">{item.purchase_platform}</span>
              )}
              <span className="text-zinc-500">
                Purchased {formatDate(item.purchase_date)}
              </span>
              <span className="text-zinc-500">
                Opened {formatDate(item.opened_at)}
              </span>
            </div>
            <div className="mt-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => undo(item.id)}
                className="text-xs text-zinc-500 hover:text-blue-600 hover:underline disabled:opacity-50"
              >
                Back to inventory
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 md:block dark:border-zinc-800">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <SortHeader label="Product" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Type" sortKey="category" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Bought at" sortKey="purchase_platform" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Purchased" sortKey="purchase_date" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Cost" sortKey="purchase_price" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <SortHeader label="Opened" sortKey="opened_at" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {visible.map((item) => (
              <tr key={item.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-3">
                  <Link
                    href={`/inventory/${item.id}`}
                    className="font-medium hover:underline"
                  >
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                      isCardCategory(item.category)
                        ? "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {item.category}
                  </span>
                </td>
                <td className="px-4 py-3">{item.purchase_platform ?? "—"}</td>
                <td className="px-4 py-3">{formatDate(item.purchase_date)}</td>
                <td className="px-4 py-3 text-right">
                  {formatMoney(Number(item.purchase_price))}
                </td>
                <td className="px-4 py-3">{formatDate(item.opened_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    title="Move back to inventory (unopened)"
                    disabled={pending}
                    onClick={() => undo(item.id)}
                    className="text-xs text-zinc-500 hover:text-blue-600 hover:underline disabled:opacity-50"
                  >
                    Back to inventory
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
