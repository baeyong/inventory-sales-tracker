"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  bulkDeleteItems,
  bulkSetCategory,
  updateFulfillment,
} from "@/app/(app)/actions";
import {
  DEFAULT_CATEGORIES,
  formatDate,
  formatMoney,
  isCardCategory,
  type Item,
} from "@/lib/types";
import { matchesSearch } from "@/lib/search";
import { sortItems, type SortDir, type SortKey } from "@/lib/sort";
import SortHeader from "@/components/SortHeader";

function cardDetails(item: Item): string | null {
  if (!isCardCategory(item.category)) return null;
  const parts = [
    item.card_set,
    item.card_number ? `#${item.card_number}` : null,
    item.player,
    item.condition === "graded"
      ? `${item.grade_company ?? ""} ${item.grade ?? ""}`.trim()
      : "Raw",
  ].filter(Boolean);
  return parts.join(" · ") || null;
}

export default function InventoryTable({ items }: { items: Item[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("");
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

  const categorySuggestions = [
    ...DEFAULT_CATEGORIES,
    ...items.map((i) => i.category),
  ].filter(
    (c, i, all) =>
      all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i
  );

  function applyCategory() {
    if (selected.size === 0 || category.trim() === "") return;
    setError(null);
    startTransition(async () => {
      const res = await bulkSetCategory([...selected], category);
      if (res.error) {
        setError(res.error);
      } else {
        setSelected(new Set());
        setCategory("");
        router.refresh();
      }
    });
  }

  const allSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visible.map((i) => i.id)));
  }

  function toggleListed(item: Item) {
    setError(null);
    startTransition(async () => {
      const res = await updateFulfillment(item.id, { listed: !item.listed });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function deleteSelected() {
    if (selected.size === 0) return;
    if (
      !confirm(
        `Delete ${selected.size} item${selected.size === 1 ? "" : "s"} permanently?`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await bulkDeleteItems([...selected]);
      if (res.error) {
        setError(res.error);
      } else {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="w-64 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
      </div>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span>{selected.size} selected</span>
          <span className="flex items-center gap-1">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyCategory()}
              list="bulk-categories"
              placeholder="Category…"
              className="w-36 rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <datalist id="bulk-categories">
              {categorySuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={applyCategory}
              disabled={pending || category.trim() === ""}
              className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Set category
            </button>
          </span>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={pending}
            className="rounded-md border border-red-300 px-3 py-1.5 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            {pending ? "Working…" : "Delete selected"}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-zinc-500 hover:underline"
          >
            Clear
          </button>
          {error && (
            <span className="text-red-600 dark:text-red-400">{error}</span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="accent-blue-600"
                />
              </th>
              <SortHeader label="Item" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Type" sortKey="category" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3">Bought at</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <SortHeader label="Cost" sortKey="purchase_price" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <SortHeader label="Purchased" sortKey="purchase_date" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3 text-center">Listed</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {visible.map((item) => (
              <tr key={item.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.name}`}
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="accent-blue-600"
                  />
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium">{item.name}</span>
                  {cardDetails(item) && (
                    <span className="block text-xs text-zinc-500">
                      {cardDetails(item)}
                    </span>
                  )}
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
                <td className="px-4 py-3 text-right">{item.quantity}</td>
                <td className="px-4 py-3 text-right">
                  {formatMoney(Number(item.purchase_price))}
                </td>
                <td className="px-4 py-3">{formatDate(item.purchase_date)}</td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label={`Listed: ${item.name}`}
                    checked={item.listed}
                    disabled={pending}
                    onChange={() => toggleListed(item)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/inventory/${item.id}/sell`}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Sell
                    </Link>
                    <Link
                      href={`/inventory/${item.id}`}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
