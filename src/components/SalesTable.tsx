"use client";

import { useState, useTransition, type ReactNode } from "react";
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
  type Item,
} from "@/lib/types";
import { matchesSearch } from "@/lib/search";
import { sortItems, type SortDir, type SortKey } from "@/lib/sort";
import { buildBundleMeta, groupBundles, type BundleMeta } from "@/lib/bundles";
import { categoryHue } from "@/lib/categoryHue";
import {
  btnPrimary,
  btnSecondary,
  btnSmall,
  btnText,
  emptyState,
  field,
  fieldLabel,
  modalOverlay,
  modalPanel,
  signedMoney,
  toneClass,
} from "@/lib/ui";
import MobileSort from "@/components/MobileSort";
import Menu, { ChevronDown, DotsIcon, menuItem, rowMenuButton } from "@/components/Menu";
import {
  SearchCount,
  SearchField,
  SelectionDock,
  ToolbarRow,
  dockButton,
  dockClear,
  dockDivider,
  dockPrimary,
} from "@/components/Toolbar";

const profitOf = (i: Item) =>
  i.sale_payout === null ? null : Number(i.sale_payout) - Number(i.purchase_price);

/** A run of the list as it's drawn: one card per bundle, and consecutive
 * single sales sharing a card between them. Keeps the sort order intact. */
type Block =
  | { kind: "bundle"; id: string; meta: BundleMeta; members: Item[] }
  | { kind: "singles"; items: Item[] };

// Column layout shared by the column labels and every row, so a single grid
// stands in for a table and still stacks on a phone.
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 gap-y-1 md:grid-cols-[minmax(0,1fr)_100px_100px_100px_auto] md:items-center";

export default function SalesTable({
  items,
  bundleNumbers,
  toolbar,
  empty,
}: {
  items: Item[];
  bundleNumbers: Record<string, number>;
  /** Filters, shown beside the search box. */
  toolbar?: ReactNode;
  /** Shown when there's nothing to list. */
  empty?: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogIds, setDialogIds] = useState<string[] | null>(null);
  const [category, setCategory] = useState("");
  // The sales being edited in the modal — a selection, or one bundle's members.
  const [editIds, setEditIds] = useState<string[] | null>(null);
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

  // Stable number per 2+ item bundle, and a row order that keeps each
  // bundle's members contiguous so nothing separates them.
  const bundleMeta = buildBundleMeta(bundleNumbers);
  const visible = groupBundles(sorted, bundleMeta);

  const blocks: Block[] = [];
  for (const it of visible) {
    const meta = it.bundle_id ? bundleMeta.get(it.bundle_id) : undefined;
    const last = blocks[blocks.length - 1];
    if (meta) {
      if (last?.kind === "bundle" && last.id === it.bundle_id) last.members.push(it);
      else blocks.push({ kind: "bundle", id: it.bundle_id!, meta, members: [it] });
    } else if (last?.kind === "singles") {
      last.items.push(it);
    } else {
      blocks.push({ kind: "singles", items: [it] });
    }
  }

  // What each bundle sold for as a whole. Summed over every member in `items`,
  // not just the rows search left visible, so the total is the real sale total.
  // Items still missing a payout are skipped and flagged as partial.
  const bundleTotals = new Map<
    string,
    { total: number; profit: number; count: number; known: number }
  >();
  for (const it of items) {
    if (!it.bundle_id || !bundleMeta.has(it.bundle_id)) continue;
    const agg = bundleTotals.get(it.bundle_id) ?? {
      total: 0,
      profit: 0,
      count: 0,
      known: 0,
    };
    agg.count += 1;
    if (it.sale_payout !== null) {
      agg.total += Number(it.sale_payout);
      agg.profit += Number(it.sale_payout) - Number(it.purchase_price);
      agg.known += 1;
    }
    bundleTotals.set(it.bundle_id, agg);
  }

  const categorySuggestions = [
    ...DEFAULT_CATEGORIES,
    ...items.map((i) => i.category),
  ].filter(
    (c, i, all) =>
      all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i
  );

  // Pre-fill the edit modal from the sales being edited: shared values when
  // every one agrees, blank when they differ.
  function openEdit(ids: string[]) {
    if (ids.length === 0) return;
    const targets = items.filter((i) => ids.includes(i.id));
    const common = <K extends keyof Item>(key: K): string => {
      const vals = new Set(targets.map((i) => i[key] ?? ""));
      return vals.size === 1 ? String([...vals][0] ?? "") : "";
    };
    const total = targets.reduce(
      (sum, i) => sum + (i.sale_payout === null ? 0 : Number(i.sale_payout)),
      0
    );
    setEditDate(common("sale_date"));
    setEditPlatform(common("sale_platform"));
    setEditBuyer(common("buyer"));
    setEditTotal(targets.length > 1 ? total.toFixed(2) : "");
    // A single item can't be a bundle; a multi-pick defaults to grouped.
    setEditBundle(targets.length > 1);
    setError(null);
    setEditIds(ids);
  }

  function applyEdit() {
    if (!editIds || editIds.length === 0 || editDate.trim() === "") {
      setError("Sale date is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await bulkUpdateSale(editIds, {
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
        setEditIds(null);
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
  const pickedCost = picked.reduce((s, i) => s + Number(i.purchase_price), 0);
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
    flag: "payment_received" | "shipped",
    value: boolean
  ) {
    setError(null);
    const ids = members.map((m) => m.id);
    startTransition(async () => {
      const res =
        ids.length > 1
          ? await bulkSetFulfillment(ids, { [flag]: value })
          : await updateFulfillment(ids[0], { [flag]: value });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function applyFulfillment(flag: "payment_received" | "shipped", value: boolean) {
    if (selected.size === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await bulkSetFulfillment([...selected], { [flag]: value });
      if (res.error) {
        setError(res.error);
      } else {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  /** The Paid and Shipped ticks for one sale or a whole bundle. */
  function flags(members: Item[], label: string) {
    const allPaid = members.every((m) => m.payment_received);
    const allShipped = members.every((m) => m.shipped);
    return (
      <>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            aria-label={`Paid: ${label}`}
            checked={allPaid}
            disabled={pending}
            onChange={() => setFlag(members, "payment_received", !allPaid)}
            className="h-[15px] w-[15px] accent-[var(--pos)]"
          />
          Paid
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            aria-label={`Shipped: ${label}`}
            checked={allShipped}
            disabled={pending}
            onChange={() => setFlag(members, "shipped", !allShipped)}
            className="h-[15px] w-[15px] accent-[var(--pos)]"
          />
          Shipped
        </label>
      </>
    );
  }

  /** Cost, payout and profit for one sale, as grid cells. */
  function figures(item: Item) {
    const profit = profitOf(item);
    return (
        <div className="tnum col-span-2 flex gap-4 text-xs text-ink-2 md:contents md:text-[13px]">
          <span className="md:text-right">
            <span className="text-muted md:hidden">Cost </span>
            {formatMoney(Number(item.purchase_price))}
          </span>
          <span className="md:text-right md:text-ink">
            <span className="text-muted md:hidden">Payout </span>
            {item.sale_payout === null ? "—" : formatMoney(Number(item.sale_payout))}
          </span>
          <span className={`font-bold md:text-right ${toneClass(profit)}`}>
            {profit === null ? "—" : signedMoney(profit)}
          </span>
        </div>
    );
  }

  function itemName(item: Item, sub: ReactNode) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="h-[30px] w-2 shrink-0 rounded"
          style={{ background: categoryHue(item.category) }}
        />
        <div className="min-w-0">
          <Link href={`/inventory/${item.id}`} className="font-semibold hover:underline">
            {item.name}
          </Link>
          {item.quantity > 1 && (
            <span className="ml-1 text-xs text-muted">×{item.quantity}</span>
          )}
          <div className="cap mt-0.5">{sub}</div>
        </div>
      </div>
    );
  }

  function rowMenu(members: Item[], name: string) {
    return (
      <Menu
        label={`More actions for ${name}`}
        buttonClass={rowMenuButton}
        buttonContent={<DotsIcon />}
      >
        {members.length === 1 && (
          <Link href={`/inventory/${members[0].id}`} data-close className={menuItem}>
            Edit item
          </Link>
        )}
        <button
          type="button"
          data-close
          onClick={() => openEdit(members.map((m) => m.id))}
          className={menuItem}
        >
          Edit sale details
        </button>
        <button
          type="button"
          data-close
          disabled={pending}
          onClick={() => run(bulkMarkUnsold, members.map((m) => m.id))}
          className={menuItem}
        >
          Undo sale (back to inventory)
        </button>
      </Menu>
    );
  }

  function soldLine(i: Item): string {
    return [
      formatDate(i.sale_date),
      i.sale_platform,
      i.buyer ? `to ${i.buyer}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return (
    <div className="flex flex-col gap-4">
      <ToolbarRow>
        <SearchField value={search} onChange={setSearch} placeholder="Search sales…" />
        <>{toolbar}</>
        {search && (
          <SearchCount
            shown={visible.length}
            total={items.length}
            onClear={() => setSearch("")}
          />
        )}
        <span className="grow" />
        {items.length > 0 && (
          <button type="button" onClick={toggleAll} className={btnText}>
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        )}
        <MobileSort
          always
          options={[
            { key: "sale_date", label: "Sold" },
            { key: "name", label: "Item" },
            { key: "purchase_price", label: "Cost" },
            { key: "sale_payout", label: "Payout" },
            { key: "profit", label: "Profit" },
          ]}
          activeKey={sortKey}
          dir={sortDir}
          onSort={toggleSort}
        />
      </ToolbarRow>

      {error && !editIds && !dialogIds && (
        <p className="text-sm text-neg">{error}</p>
      )}

      {items.length === 0 ? (
        <div className={emptyState}>{empty}</div>
      ) : (
        <section className="flex flex-col gap-3">
          {blocks.map((block) => {
            if (block.kind === "bundle") {
              const { members, meta } = block;
              const first = members[0];
              const bt = bundleTotals.get(block.id);
              const allSel = members.every((m) => selected.has(m.id));
              const label = `bundle ${meta.num}`;
              return (
                <article key={block.id} className="card overflow-hidden">
                  <header className="flex flex-wrap items-center gap-3 bg-panel px-5 py-[15px]">
                    <input
                      type="checkbox"
                      aria-label={`Select ${label}`}
                      checked={allSel}
                      onChange={() => toggleSelection(members)}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="inline-flex items-center gap-[7px] rounded-full bg-surface px-[11px] py-[5px] text-xs font-bold text-on-soft">
                      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                        <path
                          d="M1.5 3.5 L6 1.5 L10.5 3.5 L10.5 8.5 L6 10.5 L1.5 8.5 Z M1.5 3.5 L6 5.5 L10.5 3.5 M6 5.5 L6 10.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Bundle {meta.num} · {bt?.count ?? members.length} items
                    </span>
                    <span className="text-[13px] text-panel-ink">
                      Sold <span className="tnum">{formatDate(first.sale_date)}</span>
                      {first.sale_platform && <> on {first.sale_platform}</>}
                      {first.buyer && (
                        <>
                          {" "}to <span className="font-semibold text-ink">{first.buyer}</span>
                        </>
                      )}
                    </span>
                    <span className="grow" />
                    {bt && bt.known > 0 && (
                      <span className="whitespace-nowrap">
                        <span className="disp tnum text-lg font-bold">
                          {formatMoney(bt.total)}
                        </span>{" "}
                        <span className="cap">
                          {bt.known < bt.count ? "so far" : "total"}
                        </span>
                      </span>
                    )}
                  </header>

                  <div className={`${ROW_GRID} hidden px-5 py-[11px] md:grid`}>
                    <span className="cap">Item</span>
                    <span className="cap text-right">Cost</span>
                    <span className="cap text-right">Payout</span>
                    <span className="cap text-right">Profit</span>
                    <span className="w-[31px]" />
                  </div>
                  <ul>
                    {members.map((m) => (
                      <li
                        key={m.id}
                        className={`${ROW_GRID} border-t border-line px-5 py-[13px] text-[13px]`}
                      >
                        {itemName(m, m.category)}
                        <span className="md:order-last">
                          <Menu
                            label={`More actions for ${m.name}`}
                            buttonClass={rowMenuButton}
                            buttonContent={<DotsIcon />}
                          >
                            <Link href={`/inventory/${m.id}`} data-close className={menuItem}>
                              Edit item
                            </Link>
                          </Menu>
                        </span>
                        {figures(m)}
                      </li>
                    ))}
                  </ul>

                  <footer className="flex flex-wrap items-center gap-x-[18px] gap-y-2 bg-inset px-5 py-[13px]">
                    <span className="cap">Whole bundle</span>
                    {flags(members, label)}
                    <span className="grow" />
                    <button
                      type="button"
                      onClick={() => openEdit(members.map((m) => m.id))}
                      className={btnSmall}
                    >
                      Edit bundle
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(bulkMarkUnsold, members.map((m) => m.id))}
                      className={`${btnText} !text-xs`}
                    >
                      Undo sale
                    </button>
                    {bt && bt.known > 0 && (
                      <span
                        className={`disp tnum text-sm font-bold ${toneClass(bt.profit)}`}
                      >
                        {signedMoney(bt.profit)} profit
                      </span>
                    )}
                  </footer>
                </article>
              );
            }

            return (
              <article
                key={`singles-${block.items[0].id}`}
                className="card overflow-hidden"
              >
                <ul>
                  {block.items.map((item, idx) => (
                    <li
                      key={item.id}
                      className={`flex gap-3 px-5 py-[13px] text-[13px] ${
                        idx > 0 ? "border-t border-line" : ""
                      } ${selected.has(item.id) ? "bg-inset" : ""}`}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.name}`}
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelection([item])}
                        className="mt-2 h-4 w-4 shrink-0 accent-accent md:mt-0 md:self-center"
                      />
                      <div className="min-w-0 grow md:grid md:grid-cols-[minmax(0,1fr)_100px_100px_100px_150px_auto] md:items-center md:gap-x-3.5">
                        <div className="flex items-start justify-between gap-3 md:contents">
                          {itemName(item, soldLine(item))}
                          <span className="md:order-last">
                            {rowMenu([item], item.name)}
                          </span>
                        </div>
                        <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)] md:contents">
                          {figures(item)}
                        </div>
                        <div className="mt-2 flex gap-3 md:mt-0 md:justify-center">
                          {flags([item], item.name)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>
      )}

      {selected.size > 0 && (
        <SelectionDock>
          <span className="whitespace-nowrap text-[13px] font-semibold">
            {selected.size} selected
          </span>
          <span className="tnum text-[13px] text-dock-muted">
            {formatMoney(pickedCost)} cost · {formatMoney(pickedPayout)} payout ·{" "}
            <span className="font-semibold text-white">
              {signedMoney(pickedProfit)}
            </span>
            {pickedMissing > 0 && ` · ${pickedMissing} missing a payout`}
          </span>
          <span className={dockDivider} />
          <button
            type="button"
            onClick={() => openEdit([...selected])}
            disabled={pending}
            className={dockPrimary}
          >
            Edit sale details
          </button>
          <button
            type="button"
            onClick={() => applyFulfillment("payment_received", true)}
            disabled={pending}
            className={dockButton}
          >
            Mark paid
          </button>
          <button
            type="button"
            onClick={() => applyFulfillment("shipped", true)}
            disabled={pending}
            className={dockButton}
          >
            Mark shipped
          </button>
          <Menu
            label="More actions for the selection"
            buttonClass={dockButton}
            buttonContent={
              <>
                More <ChevronDown />
              </>
            }
            up
          >
            <div className="flex items-center gap-1.5 p-1.5">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyCategory()}
                list="bulk-categories-sales"
                placeholder="Category…"
                aria-label="New category"
                className={`${field} !py-2`}
              />
              <datalist id="bulk-categories-sales">
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <button
                type="button"
                data-close
                onClick={applyCategory}
                disabled={pending || category.trim() === ""}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-[9px] bg-inset px-3 py-2 text-xs font-semibold text-ink hover:bg-line disabled:opacity-50"
              >
                Set
              </button>
            </div>
            <button
              type="button"
              data-close
              onClick={() => setDialogIds([...selected])}
              disabled={pending}
              className={`${menuItem} !text-neg`}
            >
              Delete selected…
            </button>
          </Menu>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className={dockClear}
          >
            Clear
          </button>
        </SelectionDock>
      )}

      {editIds && (
        <div className={modalOverlay}>
          <div className={modalPanel}>
            <h2 className="disp text-lg font-bold">
              Edit {editIds.length} sale{editIds.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Applies to every sale here. Leave the total blank to keep each
              item&rsquo;s current payout.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className={fieldLabel}>Sale date</span>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className={field}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>Platform</span>
                <input
                  value={editPlatform}
                  onChange={(e) => setEditPlatform(e.target.value)}
                  list="sales-edit-platforms"
                  placeholder="e.g. eBay"
                  className={field}
                />
                <datalist id="sales-edit-platforms">
                  {platformSuggestions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>
              <label className="block">
                <span className={fieldLabel}>Buyer / username</span>
                <input
                  value={editBuyer}
                  onChange={(e) => setEditBuyer(e.target.value)}
                  placeholder="Optional"
                  className={field}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>
                  Total payout {editIds.length > 1 && "(split evenly)"}
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={editTotal}
                  onChange={(e) => setEditTotal(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className={field}
                />
              </label>
              {editIds.length > 1 && (
                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={editBundle}
                    onChange={(e) => setEditBundle(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="text-ink-2">Keep these grouped as one bundle</span>
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditIds(null)}
                className={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={applyEdit}
                className={btnPrimary}
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-neg">{error}</p>}
          </div>
        </div>
      )}

      {dialogIds && (
        <div className={modalOverlay}>
          <div className={modalPanel}>
            <h2 className="disp text-lg font-bold">
              Delete {dialogIds.length} sale{dialogIds.length === 1 ? "" : "s"}?
            </h2>
            <p className="mt-2 text-[13px] text-muted">
              Do you want the item{dialogIds.length === 1 ? "" : "s"} deleted
              from inventory as well, or just the sale record removed?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(bulkDeleteItems, dialogIds)}
                className="inline-flex items-center justify-center rounded-full bg-neg px-4 py-3 text-[13px] font-semibold text-surface hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Working…" : "Delete entirely (item and sale)"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(bulkMarkUnsold, dialogIds)}
                className={btnSecondary}
              >
                Keep in inventory (remove sale info only)
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setDialogIds(null)}
                className={btnText + " py-2"}
              >
                Cancel
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-neg">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
