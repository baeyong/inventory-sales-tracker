"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  bulkMarkUnopened,
  bulkUnmarkInvestment,
  bulkUnmarkPersonal,
} from "@/app/(app)/actions";
import { formatDate, formatMoney, isCardCategory, type Item } from "@/lib/types";
import { matchesSearch } from "@/lib/search";
import { sortItems, type SortDir, type SortKey } from "@/lib/sort";
import SortHeader from "@/components/SortHeader";
import MobileSort from "@/components/MobileSort";

/** The three pages that list items held outside Inventory — Investments,
 * Personal Collection and opened boxes — are the same table. This is it; the
 * config below is the complete set of differences between them. */
export type HoldingKind = "investment" | "personal" | "opened";

/** The date column that says when an item entered this list. */
type StateKey = "invested_at" | "personal_at" | "opened_at";

type Config = {
  /** Clears the state column and sends the item back to Inventory. */
  moveBack: (ids: string[]) => Promise<{ error?: string }>;
  searchPlaceholder: string;
  /** "Item" everywhere except opened boxes, which hold products not items. */
  nameLabel: string;
  stateKey: StateKey;
  stateLabel: string;
  /** Opened boxes don't carry an estimated value — the pulls do. */
  showEstValue: boolean;
  backTitle: string;
  sortOptions: { key: SortKey; label: string }[];
};

const CONFIG: Record<HoldingKind, Config> = {
  investment: {
    moveBack: bulkUnmarkInvestment,
    searchPlaceholder: "Search holdings…",
    nameLabel: "Item",
    stateKey: "invested_at",
    stateLabel: "Moved",
    showEstValue: true,
    backTitle: "Move back to inventory",
    sortOptions: [
      { key: "name", label: "Item" },
      { key: "category", label: "Type" },
      { key: "purchase_price", label: "Cost" },
      { key: "est_value", label: "Est. value" },
      { key: "purchase_date", label: "Purchased" },
      { key: "invested_at", label: "Moved" },
    ],
  },
  personal: {
    moveBack: bulkUnmarkPersonal,
    searchPlaceholder: "Search collection…",
    nameLabel: "Item",
    stateKey: "personal_at",
    stateLabel: "Kept since",
    showEstValue: true,
    backTitle: "Move back to inventory",
    sortOptions: [
      { key: "name", label: "Item" },
      { key: "category", label: "Type" },
      { key: "purchase_price", label: "Cost" },
      { key: "est_value", label: "Est. value" },
      { key: "purchase_date", label: "Purchased" },
      { key: "personal_at", label: "Kept since" },
    ],
  },
  opened: {
    moveBack: bulkMarkUnopened,
    searchPlaceholder: "Search opened product…",
    nameLabel: "Product",
    stateKey: "opened_at",
    stateLabel: "Opened",
    showEstValue: false,
    backTitle: "Move back to inventory (unopened)",
    sortOptions: [
      { key: "name", label: "Product" },
      { key: "category", label: "Type" },
      { key: "purchase_platform", label: "Bought at" },
      { key: "purchase_date", label: "Purchased" },
      { key: "purchase_price", label: "Cost" },
      { key: "opened_at", label: "Opened" },
    ],
  },
};

export default function HoldingsTable({
  items,
  kind,
}: {
  items: Item[];
  kind: HoldingKind;
}) {
  const cfg = CONFIG[kind];
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

  function moveBack(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await cfg.moveBack([id]);
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
          placeholder={cfg.searchPlaceholder}
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
        options={cfg.sortOptions}
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
              {cfg.showEstValue && item.est_value !== null && (
                <span title="Your estimated value">
                  ≈ {formatMoney(Number(item.est_value))}
                </span>
              )}
              {item.purchase_platform && (
                <span className="text-zinc-500">{item.purchase_platform}</span>
              )}
              <span className="text-zinc-500">
                Purchased {formatDate(item.purchase_date)}
              </span>
              <span className="text-zinc-500">
                {cfg.stateLabel} {formatDate(item[cfg.stateKey])}
              </span>
            </div>
            <div className="mt-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => moveBack(item.id)}
                className="text-xs text-zinc-500 hover:text-blue-600 hover:underline disabled:opacity-50"
              >
                Back to inventory
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table. One column narrower without Est. value. */}
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 md:block dark:border-zinc-800">
        <table
          className={`w-full text-sm ${
            cfg.showEstValue ? "min-w-[860px]" : "min-w-[820px]"
          }`}
        >
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <SortHeader label={cfg.nameLabel} sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Type" sortKey="category" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Bought at" sortKey="purchase_platform" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Purchased" sortKey="purchase_date" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Cost" sortKey="purchase_price" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              {cfg.showEstValue && (
                <SortHeader label="Est. value" sortKey="est_value" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              )}
              <SortHeader label={cfg.stateLabel} sortKey={cfg.stateKey} activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
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
                {cfg.showEstValue && (
                  <td className="px-4 py-3 text-right">
                    {item.est_value === null ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      formatMoney(Number(item.est_value))
                    )}
                  </td>
                )}
                <td className="px-4 py-3">{formatDate(item[cfg.stateKey])}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    title={cfg.backTitle}
                    disabled={pending}
                    onClick={() => moveBack(item.id)}
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
