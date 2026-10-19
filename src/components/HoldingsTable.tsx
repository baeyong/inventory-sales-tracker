"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkUnmarkInvestment, bulkUnmarkPersonal } from "@/app/(app)/actions";
import { formatDate, formatMoney, isCardCategory, type Item } from "@/lib/types";
import { matchesSearch } from "@/lib/search";
import { sortItems, type SortDir, type SortKey } from "@/lib/sort";
import { categoryHue } from "@/lib/categoryHue";
import { btnRow, emptyState, td, th } from "@/lib/ui";
import SortHeader from "@/components/SortHeader";
import MobileSort from "@/components/MobileSort";
import { SearchCount, SearchField, ToolbarRow } from "@/components/Toolbar";

/** Investments and the Personal Collection list items held outside Inventory
 * in the same table. This is it; the config below is the complete set of
 * differences between them. (Opened boxes have their own view, grouped with
 * what was pulled from each.) */
export type HoldingKind = "investment" | "personal";

/** The date column that says when an item entered this list. */
type StateKey = "invested_at" | "personal_at";

type Config = {
  /** Clears the state column and sends the item back to Inventory. */
  moveBack: (ids: string[]) => Promise<{ error?: string }>;
  searchPlaceholder: string;
  stateKey: StateKey;
  stateLabel: string;
  sortOptions: { key: SortKey; label: string }[];
};

const CONFIG: Record<HoldingKind, Config> = {
  investment: {
    moveBack: bulkUnmarkInvestment,
    searchPlaceholder: "Search holdings…",
    stateKey: "invested_at",
    stateLabel: "Moved",
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
    stateKey: "personal_at",
    stateLabel: "Kept since",
    sortOptions: [
      { key: "name", label: "Item" },
      { key: "category", label: "Type" },
      { key: "purchase_price", label: "Cost" },
      { key: "est_value", label: "Est. value" },
      { key: "purchase_date", label: "Purchased" },
      { key: "personal_at", label: "Kept since" },
    ],
  },
};

function detailLine(item: Item): string {
  const card = isCardCategory(item.category)
    ? [
        item.card_set,
        item.card_number ? `#${item.card_number}` : null,
        item.condition === "graded"
          ? `${item.grade_company ?? ""} ${item.grade ?? ""}`.trim()
          : "Raw",
      ]
    : [];
  return [item.category, ...card].filter(Boolean).join(" · ");
}

export default function HoldingsTable({
  items,
  kind,
  empty,
}: {
  items: Item[];
  kind: HoldingKind;
  empty?: ReactNode;
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

  const hueBar = (item: Item) => (
    <span
      className="h-8 w-2 shrink-0 rounded"
      style={{ background: categoryHue(item.category) }}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <ToolbarRow>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={cfg.searchPlaceholder}
        />
        {search && (
          <SearchCount
            shown={visible.length}
            total={items.length}
            onClear={() => setSearch("")}
          />
        )}
        {error && <span className="text-sm text-neg">{error}</span>}
        <span className="grow" />
        <MobileSort
          options={cfg.sortOptions}
          activeKey={sortKey}
          dir={sortDir}
          onSort={toggleSort}
        />
      </ToolbarRow>

      {items.length === 0 ? (
        <div className={emptyState}>{empty}</div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {visible.map((item) => (
              <li key={item.id} className="card p-4">
                <div className="flex items-start gap-3">
                  {hueBar(item)}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/inventory/${item.id}`}
                      className="font-semibold hover:underline"
                    >
                      {item.name}
                    </Link>
                    <div className="cap mt-0.5">{detailLine(item)}</div>
                    <div className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
                      <span className="font-semibold text-ink">
                        {formatMoney(Number(item.purchase_price))}
                      </span>
                      {item.est_value !== null && (
                        <span>worth {formatMoney(Number(item.est_value))}</span>
                      )}
                      <span>
                        {cfg.stateLabel} {formatDate(item[cfg.stateKey])}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pl-5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => moveBack(item.id)}
                    className={btnRow}
                  >
                    Back to inventory
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-inset">
                    <SortHeader label="Item" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} className="pl-5" />
                    <SortHeader label="Bought" sortKey="purchase_date" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Cost" sortKey="purchase_price" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <SortHeader label="Est. value" sortKey="est_value" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <SortHeader label={cfg.stateLabel} sortKey={cfg.stateKey} activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <th className={`${th} pr-5`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id}>
                      <td className={`${td} pl-5`}>
                        <div className="flex items-center gap-3">
                          {hueBar(item)}
                          <div className="min-w-0">
                            <Link
                              href={`/inventory/${item.id}`}
                              className="font-semibold hover:underline"
                            >
                              {item.name}
                            </Link>
                            <div className="cap mt-0.5">{detailLine(item)}</div>
                          </div>
                        </div>
                      </td>
                      <td className={`${td} text-ink-2`}>
                        <div className="text-xs">{item.purchase_platform ?? "—"}</div>
                        <div className="cap tnum mt-0.5">
                          {formatDate(item.purchase_date)}
                        </div>
                      </td>
                      <td className={`${td} tnum text-right text-ink-2`}>
                        {formatMoney(Number(item.purchase_price))}
                      </td>
                      <td className={`${td} disp tnum text-right text-[15px] font-bold`}>
                        {item.est_value === null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          formatMoney(Number(item.est_value))
                        )}
                      </td>
                      <td className={`${td} tnum text-ink-2`}>
                        {formatDate(item[cfg.stateKey])}
                      </td>
                      <td className={`${td} pr-5 text-right`}>
                        <button
                          type="button"
                          title="Move back to inventory"
                          disabled={pending}
                          onClick={() => moveBack(item.id)}
                          className={`${btnRow} whitespace-nowrap`}
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
        </>
      )}
    </div>
  );
}
