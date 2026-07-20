"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  bulkDeleteItems,
  bulkMarkUnsold,
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

export default function SalesTable({ items }: { items: Item[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogIds, setDialogIds] = useState<string[] | null>(null);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = items.filter((i) => matchesSearch(i, search));

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

  function run(action: (ids: string[]) => Promise<{ error?: string }>, ids: string[]) {
    setError(null);
    startTransition(async () => {
      const res = await action(ids);
      if (res.error) {
        setError(res.error);
      } else {
        setSelected(new Set());
        setDialogIds(null);
        router.refresh();
      }
    });
  }

  function toggleFlag(
    item: Item,
    field: "payment_received" | "shipped"
  ) {
    setError(null);
    startTransition(async () => {
      const res = await updateFulfillment(item.id, { [field]: !item[field] });
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
          placeholder="Search sales…"
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
              list="bulk-categories-sales"
              placeholder="Category…"
              className="w-36 rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <datalist id="bulk-categories-sales">
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
            onClick={() => setDialogIds([...selected])}
            disabled={pending}
            className="rounded-md border border-red-300 px-3 py-1.5 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete selected
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
        <table className="w-full min-w-[880px] text-sm">
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
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Sold</th>
              <th className="px-4 py-3">Bought at</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Payout</th>
              <th className="px-4 py-3 text-right">Profit</th>
              <th className="px-4 py-3 text-center">Paid</th>
              <th className="px-4 py-3 text-center">Shipped</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {visible.map((item) => {
              const profit =
                item.sale_payout === null
                  ? null
                  : Number(item.sale_payout) - Number(item.purchase_price);
              return (
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
                    <Link
                      href={`/inventory/${item.id}`}
                      className="font-medium hover:underline"
                    >
                      {item.name}
                    </Link>
                    {item.quantity > 1 && (
                      <span className="ml-1 text-xs text-zinc-500">
                        ×{item.quantity}
                      </span>
                    )}
                    <span
                      className={`ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                        isCardCategory(item.category)
                          ? "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {item.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatDate(item.sale_date)}</td>
                  <td className="px-4 py-3">
                    {item.purchase_platform ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(Number(item.purchase_price))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.sale_payout === null
                      ? "—"
                      : formatMoney(Number(item.sale_payout))}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      profit === null
                        ? "text-zinc-400"
                        : profit >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {profit === null ? "—" : formatMoney(profit)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Payment received for ${item.name}`}
                      checked={item.payment_received}
                      disabled={pending}
                      onChange={() => toggleFlag(item, "payment_received")}
                      className="h-4 w-4 accent-emerald-600"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Shipped ${item.name}`}
                      checked={item.shipped}
                      disabled={pending}
                      onChange={() => toggleFlag(item, "shipped")}
                      className="h-4 w-4 accent-emerald-600"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      title="Move back to inventory (clears sale info)"
                      disabled={pending}
                      onClick={() => run(bulkMarkUnsold, [item.id])}
                      className="text-xs text-zinc-500 hover:text-blue-600 hover:underline disabled:opacity-50"
                    >
                      Undo sale
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialogIds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">
              Delete {dialogIds.length} sale{dialogIds.length === 1 ? "" : "s"}?
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Do you want the item{dialogIds.length === 1 ? "" : "s"} deleted
              from inventory as well, or just the sale record removed?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(bulkDeleteItems, dialogIds)}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? "Working…" : "Delete entirely (item and sale)"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(bulkMarkUnsold, dialogIds)}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Keep in inventory (remove sale info only)
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setDialogIds(null)}
                className="rounded-md px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
            {error && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
