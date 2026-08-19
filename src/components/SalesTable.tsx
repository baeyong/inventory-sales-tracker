"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  bulkDeleteItems,
  bulkMarkUnsold,
  bulkSetCategory,
  bulkSetFulfillment,
  bulkUpdateSale,
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
import { buildBundleMeta, groupBundles } from "@/lib/bundles";
import SortHeader from "@/components/SortHeader";

export default function SalesTable({
  items,
  bundleNumbers,
}: {
  items: Item[];
  bundleNumbers: Record<string, number>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogIds, setDialogIds] = useState<string[] | null>(null);
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editPlatform, setEditPlatform] = useState("");
  const [editBuyer, setEditBuyer] = useState("");
  const [editTotal, setEditTotal] = useState("");
  const [editBundle, setEditBundle] = useState(true);
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

  const sorted = sortItems(
    items.filter((i) => matchesSearch(i, search)),
    sortKey,
    sortDir
  );

  // Stable number + colour per 2+ item bundle, and a row order that keeps each
  // bundle's members contiguous so nothing separates them.
  const bundleMeta = buildBundleMeta(bundleNumbers);
  const visible = groupBundles(sorted, bundleMeta);

  // Visible members of each bundle, in display order — the first one carries
  // the bundle's shared (row-spanning) checkbox/paid/shipped cells.
  const bundleVisible = new Map<string, Item[]>();
  for (const it of visible) {
    if (!it.bundle_id || !bundleMeta.has(it.bundle_id)) continue;
    const arr = bundleVisible.get(it.bundle_id) ?? [];
    arr.push(it);
    bundleVisible.set(it.bundle_id, arr);
  }

  // What each bundle sold for as a whole. Summed over every member in `items`,
  // not just the rows search left visible, so the total is the real sale total.
  // Items still missing a payout are skipped and flagged as partial.
  const bundleTotals = new Map<
    string,
    { total: number; count: number; known: number }
  >();
  for (const it of items) {
    if (!it.bundle_id || !bundleMeta.has(it.bundle_id)) continue;
    const agg = bundleTotals.get(it.bundle_id) ?? { total: 0, count: 0, known: 0 };
    agg.count += 1;
    if (it.sale_payout !== null) {
      agg.total += Number(it.sale_payout);
      agg.known += 1;
    }
    bundleTotals.set(it.bundle_id, agg);
  }

  function selectBundle(bundleId: string) {
    const ids = (bundleVisible.get(bundleId) ?? []).map((i) => i.id);
    setSelected((prev) => new Set([...prev, ...ids]));
  }

  const categorySuggestions = [
    ...DEFAULT_CATEGORIES,
    ...items.map((i) => i.category),
  ].filter(
    (c, i, all) =>
      all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i
  );

  // Pre-fill the edit modal from the current selection: shared values when
  // every selected item agrees, blank when they differ.
  function openEdit() {
    if (selected.size === 0) return;
    const common = <K extends keyof Item>(key: K): string => {
      const vals = new Set(picked.map((i) => i[key] ?? ""));
      return vals.size === 1 ? String([...vals][0] ?? "") : "";
    };
    const total = picked.reduce(
      (sum, i) => sum + (i.sale_payout === null ? 0 : Number(i.sale_payout)),
      0
    );
    setEditDate(common("sale_date"));
    setEditPlatform(common("sale_platform"));
    setEditBuyer(common("buyer"));
    setEditTotal(picked.length > 1 ? total.toFixed(2) : "");
    // A single item can't be a bundle; a multi-pick defaults to grouped.
    setEditBundle(picked.length > 1);
    setError(null);
    setEditing(true);
  }

  function applyEdit() {
    if (selected.size === 0 || editDate.trim() === "") {
      setError("Sale date is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await bulkUpdateSale([...selected], {
        sale_date: editDate,
        sale_platform: editPlatform,
        buyer: editBuyer,
        total_payout: editTotal.trim() === "" ? null : editTotal,
        bundle: editBundle,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setSelected(new Set());
        setEditing(false);
        router.refresh();
      }
    });
  }

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

  const platformSuggestions = [
    ...new Set(
      items
        .map((i) => i.sale_platform)
        .filter((p): p is string => !!p && p.trim() !== "")
    ),
  ];

  // Running totals for whatever is selected, so any set of sales can be sized
  // up in place. Cost covers every pick; payout and profit only count the ones
  // with a payout recorded, matching how the page header reports them.
  const picked = items.filter((i) => selected.has(i.id));
  const pickedWithPayout = picked.filter((i) => i.sale_payout !== null);
  const pickedCost = picked.reduce(
    (s, i) => s + Number(i.purchase_price),
    0
  );
  const pickedPayout = pickedWithPayout.reduce(
    (s, i) => s + Number(i.sale_payout),
    0
  );
  const pickedProfit = pickedWithPayout.reduce(
    (s, i) => s + Number(i.sale_payout) - Number(i.purchase_price),
    0
  );
  const pickedMissing = picked.length - pickedWithPayout.length;

  const allSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));

  // Select/deselect a whole bundle (or a single item) with one checkbox.
  function toggleSelection(members: Item[]) {
    const ids = members.map((m) => m.id);
    const allSel = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allSel) next.delete(id);
        else next.add(id);
      }
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

  // One Paid/Shipped checkbox drives the whole bundle (or a single item).
  function setFlag(
    members: Item[],
    field: "payment_received" | "shipped",
    value: boolean
  ) {
    setError(null);
    const ids = members.map((m) => m.id);
    startTransition(async () => {
      const res =
        ids.length > 1
          ? await bulkSetFulfillment(ids, { [field]: value })
          : await updateFulfillment(ids[0], { [field]: value });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function applyFulfillment(field: "payment_received" | "shipped", value: boolean) {
    if (selected.size === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await bulkSetFulfillment([...selected], { [field]: value });
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
          placeholder="Search sales…"
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
      </div>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{selected.size} selected</span>
            <span className="text-zinc-500">
              {formatMoney(pickedCost)} cost · {formatMoney(pickedPayout)} payout
              {" · "}
              <span
                className={`font-medium ${
                  pickedProfit >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {formatMoney(pickedProfit)} profit
              </span>
              {pickedMissing > 0 && ` · ${pickedMissing} missing a payout`}
            </span>
          </span>
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
            onClick={openEdit}
            disabled={pending}
            className="rounded-md border border-blue-300 px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950"
          >
            Edit sale details
          </button>
          <button
            type="button"
            onClick={() => applyFulfillment("payment_received", true)}
            disabled={pending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Mark paid
          </button>
          <button
            type="button"
            onClick={() => applyFulfillment("shipped", true)}
            disabled={pending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Mark shipped
          </button>
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

      {/* Mobile: stacked cards (one per bundle or item) */}
      <ul className="space-y-3 md:hidden">
        {visible.map((item) => {
          const meta = item.bundle_id
            ? bundleMeta.get(item.bundle_id)
            : undefined;
          const members = meta ? bundleVisible.get(item.bundle_id!)! : [item];
          if (meta && members[0].id !== item.id) return null;
          const allSel = members.every((m) => selected.has(m.id));
          const allPaid = members.every((m) => m.payment_received);
          const allShipped = members.every((m) => m.shipped);
          const bt = item.bundle_id ? bundleTotals.get(item.bundle_id) : undefined;
          return (
            <li
              key={item.id}
              className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 ${
                meta ? `border-l-4 ${meta.color.stripe}` : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={
                    meta ? `Select bundle ${meta.num}` : `Select ${item.name}`
                  }
                  checked={allSel}
                  onChange={() => toggleSelection(members)}
                  className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                />
                <div className="min-w-0 flex-1">
                  {meta && (
                    <span
                      className={`mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.color.badge}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${meta.color.dot}`} />
                      Bundle {meta.num} · {members.length} items
                    </span>
                  )}
                  <div className="space-y-2">
                    {members.map((m) => {
                      const profit =
                        m.sale_payout === null
                          ? null
                          : Number(m.sale_payout) - Number(m.purchase_price);
                      return (
                        <div
                          key={m.id}
                          className={
                            meta
                              ? "border-t border-zinc-100 pt-2 first:border-t-0 first:pt-0 dark:border-zinc-800"
                              : ""
                          }
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/inventory/${m.id}`}
                              className="font-medium hover:underline"
                            >
                              {m.name}
                            </Link>
                            <span
                              className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                                isCardCategory(m.category)
                                  ? "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                              }`}
                            >
                              {m.category}
                            </span>
                          </div>
                          {m.buyer && (
                            <span className="block text-xs text-zinc-500">
                              Buyer: {m.buyer}
                            </span>
                          )}
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                            <span className="text-zinc-500">
                              {formatDate(m.sale_date)}
                            </span>
                            {m.purchase_platform && (
                              <span className="text-zinc-500">
                                {m.purchase_platform}
                              </span>
                            )}
                            <span>Cost {formatMoney(Number(m.purchase_price))}</span>
                            <span>
                              Payout{" "}
                              {m.sale_payout === null
                                ? "—"
                                : formatMoney(Number(m.sale_payout))}
                            </span>
                            <span
                              className={
                                profit === null
                                  ? "text-zinc-400"
                                  : profit >= 0
                                    ? "font-medium text-emerald-600 dark:text-emerald-400"
                                    : "font-medium text-red-600 dark:text-red-400"
                              }
                            >
                              {profit === null
                                ? "—"
                                : `${formatMoney(profit)} profit`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {meta && bt && bt.known > 0 && (
                    <div className="mt-2 text-sm font-semibold">
                      Bundle total {formatMoney(bt.total)}
                      {bt.known < bt.count && (
                        <span className="ml-1 text-xs font-normal text-zinc-500">
                          so far
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={allPaid}
                        disabled={pending}
                        onChange={() =>
                          setFlag(members, "payment_received", !allPaid)
                        }
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <span className="text-zinc-500">Paid</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={allShipped}
                        disabled={pending}
                        onChange={() => setFlag(members, "shipped", !allShipped)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <span className="text-zinc-500">Shipped</span>
                    </label>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(bulkMarkUnsold, members.map((m) => m.id))}
                      className="ml-auto text-xs text-zinc-500 hover:text-blue-600 hover:underline disabled:opacity-50"
                    >
                      Undo sale
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 md:block dark:border-zinc-800">
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
              <SortHeader label="Item" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Sold" sortKey="sale_date" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3">Bought at</th>
              <SortHeader label="Cost" sortKey="purchase_price" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <SortHeader label="Payout" sortKey="sale_payout" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <SortHeader label="Profit" sortKey="profit" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
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
              const meta = item.bundle_id
                ? bundleMeta.get(item.bundle_id)
                : undefined;
              const bundleTotal = item.bundle_id
                ? bundleTotals.get(item.bundle_id)
                : undefined;
              // Members of this bundle (or just this item); the first member
              // carries the shared, row-spanning cells.
              const members = meta
                ? bundleVisible.get(item.bundle_id!)!
                : [item];
              const isFirst = members[0].id === item.id;
              const isLast = members[members.length - 1].id === item.id;
              // A bundle closes with its own total row, so the shared cells
              // have to span that extra row too.
              const hasSubtotal = !!meta && !!bundleTotal && bundleTotal.known > 0;
              const span = members.length + (hasSubtotal ? 1 : 0);
              const allSel = members.every((m) => selected.has(m.id));
              const allPaid = members.every((m) => m.payment_received);
              const allShipped = members.every((m) => m.shipped);
              return (
                <Fragment key={item.id}>
                <tr
                  className={
                    meta
                      ? "bg-zinc-50/70 dark:bg-zinc-900/40"
                      : "bg-white dark:bg-zinc-950"
                  }
                >
                  {isFirst && (
                    <td
                      rowSpan={span}
                      className={`border-l-4 px-4 py-3 align-middle ${
                        meta ? meta.color.stripe : "border-l-transparent"
                      }`}
                    >
                      <input
                        type="checkbox"
                        aria-label={
                          meta
                            ? `Select bundle ${meta.num}`
                            : `Select ${item.name}`
                        }
                        checked={allSel}
                        onChange={() => toggleSelection(members)}
                        className="accent-blue-600"
                      />
                    </td>
                  )}
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
                    {item.buyer && (
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        Buyer: {item.buyer}
                      </span>
                    )}
                    {meta && isFirst && (
                      <button
                        type="button"
                        onClick={() => selectBundle(item.bundle_id!)}
                        title="Select all items in this bundle"
                        className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.color.badge}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${meta.color.dot}`} />
                        Bundle {meta.num} · {span} items
                      </button>
                    )}
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
                  {isFirst && (
                    <td
                      rowSpan={span}
                      className="px-4 py-3 text-center align-middle"
                    >
                      <input
                        type="checkbox"
                        aria-label={
                          meta
                            ? `Payment received for bundle ${meta.num}`
                            : `Payment received for ${item.name}`
                        }
                        checked={allPaid}
                        disabled={pending}
                        onChange={() =>
                          setFlag(members, "payment_received", !allPaid)
                        }
                        className="h-4 w-4 accent-emerald-600"
                      />
                    </td>
                  )}
                  {isFirst && (
                    <td
                      rowSpan={span}
                      className="px-4 py-3 text-center align-middle"
                    >
                      <input
                        type="checkbox"
                        aria-label={
                          meta ? `Shipped bundle ${meta.num}` : `Shipped ${item.name}`
                        }
                        checked={allShipped}
                        disabled={pending}
                        onChange={() => setFlag(members, "shipped", !allShipped)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                    </td>
                  )}
                  {isFirst && (
                    <td
                      rowSpan={span}
                      className="px-4 py-3 text-right align-middle"
                    >
                      <button
                        type="button"
                        title={
                          meta
                            ? "Move the whole bundle back to inventory (clears sale info)"
                            : "Move back to inventory (clears sale info)"
                        }
                        disabled={pending}
                        onClick={() =>
                          run(bulkMarkUnsold, members.map((m) => m.id))
                        }
                        className="text-xs text-zinc-500 hover:text-blue-600 hover:underline disabled:opacity-50"
                      >
                        Undo sale
                      </button>
                    </td>
                  )}
                </tr>
                {/* Closes the bundle block: a subtotal that belongs to the
                    group, not to the last item's record. */}
                {isLast && hasSubtotal && (
                  <tr className="bg-zinc-50/70 dark:bg-zinc-900/40">
                    <td
                      colSpan={4}
                      className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-zinc-500"
                    >
                      Bundle {meta!.num} total
                    </td>
                    <td
                      title={`What all ${bundleTotal!.count} items in bundle ${
                        meta!.num
                      } sold for together${
                        bundleTotal!.known < bundleTotal!.count
                          ? `, counting the ${bundleTotal!.known} with a payout recorded`
                          : ""
                      }`}
                      className="px-4 py-2 text-right font-semibold"
                    >
                      {formatMoney(bundleTotal!.total)}
                      {bundleTotal!.known < bundleTotal!.count && (
                        <span className="ml-1 text-xs font-normal text-zinc-500">
                          so far
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2" />
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">
              Edit {selected.size} sale{selected.size === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Applies to every selected item. Leave the total blank to keep each
              item&rsquo;s current payout.
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <label className="block">
                <span className="text-zinc-600 dark:text-zinc-400">Sale date</span>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="block">
                <span className="text-zinc-600 dark:text-zinc-400">Platform</span>
                <input
                  value={editPlatform}
                  onChange={(e) => setEditPlatform(e.target.value)}
                  list="sales-edit-platforms"
                  placeholder="e.g. eBay"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
                <datalist id="sales-edit-platforms">
                  {platformSuggestions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>
              <label className="block">
                <span className="text-zinc-600 dark:text-zinc-400">
                  Buyer / username
                </span>
                <input
                  value={editBuyer}
                  onChange={(e) => setEditBuyer(e.target.value)}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="block">
                <span className="text-zinc-600 dark:text-zinc-400">
                  Total payout {selected.size > 1 && "(split evenly)"}
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={editTotal}
                  onChange={(e) => setEditTotal(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              {selected.size > 1 && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editBundle}
                    onChange={(e) => setEditBundle(e.target.checked)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Keep these grouped as one bundle
                  </span>
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(false)}
                className="rounded-md px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={applyEdit}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save changes"}
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
