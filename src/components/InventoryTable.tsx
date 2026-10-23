"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  bulkDeleteItems,
  bulkMarkInvestment,
  bulkMarkPersonal,
  bulkMarkOpened,
  bulkMarkSold,
  bulkSetCategory,
  bulkSetEstValues,
  updateFulfillment,
} from "@/app/(app)/actions";
import {
  DEFAULT_CATEGORIES,
  costBasis,
  PLATFORM_SUGGESTIONS,
  formatDate,
  formatMoney,
  isCardCategory,
  type Item,
} from "@/lib/types";
import { matchesSearch } from "@/lib/search";
import { sortItems, type SortDir, type SortKey } from "@/lib/sort";
import { marketLink } from "@/lib/market";
import { categoryHue } from "@/lib/categoryHue";
import {
  btnPrimary,
  btnRow,
  btnSecondary,
  btnText,
  emptyState,
  field,
  fieldLabel,
  modalOverlay,
  modalPanel,
  td,
  th,
} from "@/lib/ui";
import SortHeader from "@/components/SortHeader";
import MobileSort from "@/components/MobileSort";
import Menu, {
  ChevronDown,
  DotsIcon,
  menuItem,
  rowMenuButton,
} from "@/components/Menu";
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

/** "Category · card details · Qty 2" under an item's name. */
function detailLine(item: Item): string {
  return [
    item.category,
    cardDetails(item),
    item.quantity > 1 ? `Qty ${item.quantity}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function InventoryTable({
  items,
  toolbar,
  action,
  empty,
}: {
  items: Item[];
  /** Filters, shown beside the search box. */
  toolbar?: ReactNode;
  /** The page's main button, at the end of the toolbar. */
  action?: ReactNode;
  /** Shown in place of the table when there's nothing to list. */
  empty?: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [bundleOpen, setBundleOpen] = useState(false);
  const [bundleDate, setBundleDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [bundlePlatform, setBundlePlatform] = useState("");
  const [bundleTotal, setBundleTotal] = useState("");
  const [bundleBuyer, setBundleBuyer] = useState("");
  const [ripOpen, setRipOpen] = useState(false);
  const [ripDate, setRipDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [error, setError] = useState<string | null>(null);
  // Inline est-value edits, keyed by item id, held until "Save changes".
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  // The string shown in an item's est-value input: the pending edit if any,
  // else the stored value.
  const estString = (item: Item) =>
    item.est_value === null ? "" : String(item.est_value);
  const estInput = (item: Item) =>
    edits[item.id] !== undefined ? edits[item.id] : estString(item);
  function setEst(id: string, val: string) {
    setEdits((prev) => ({ ...prev, [id]: val }));
  }
  function itemDirty(item: Item): boolean {
    const raw = edits[item.id];
    if (raw === undefined) return false;
    const t = raw.trim();
    const orig = item.est_value === null ? null : Number(item.est_value);
    if (t === "") return orig !== null; // cleared a value
    const n = Number(t);
    if (Number.isNaN(n)) return true;
    return n !== orig;
  }
  const dirtyItems = items.filter(itemDirty);
  const invalidCount = dirtyItems.filter((i) => {
    const t = edits[i.id].trim();
    if (t === "") return false;
    const n = Number(t);
    return Number.isNaN(n) || n < 0;
  }).length;

  function saveEdits() {
    if (dirtyItems.length === 0 || invalidCount > 0) return;
    setError(null);
    const updates = dirtyItems.map((i) => {
      const t = edits[i.id].trim();
      return { id: i.id, est_value: t === "" ? null : Number(t) };
    });
    startTransition(async () => {
      const res = await bulkSetEstValues(updates);
      if (res.error) setError(res.error);
      else {
        setEdits({});
        router.refresh();
      }
    });
  }

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

  // What the current selection cost. Everything here is unsold, so cost is the
  // only figure an inventory item carries.
  const pickedCost = items
    .filter((i) => selected.has(i.id))
    .reduce((s, i) => s + costBasis(i), 0);

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

  const bundleTotalNum = parseFloat(bundleTotal);
  const bundleValid =
    bundleDate !== "" && bundleTotal !== "" && !isNaN(bundleTotalNum);
  const bundlePerItem =
    bundleValid && selected.size > 0
      ? bundleTotalNum / selected.size
      : null;

  // Keepers: out of Inventory and, unlike Investments, reported apart from
  // business stock at tax time.
  function keepPersonal() {
    if (selected.size === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await bulkMarkPersonal(
        [...selected],
        new Date().toISOString().slice(0, 10)
      );
      if (res.error) {
        setError(res.error);
      } else {
        setSelected(new Set());
        router.push("/collection");
      }
    });
  }

  // Park items as long-term holdings; they leave Inventory but keep their cost
  // and value, and can be moved back any time.
  function moveToInvestments() {
    if (selected.size === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await bulkMarkInvestment(
        [...selected],
        new Date().toISOString().slice(0, 10)
      );
      if (res.error) {
        setError(res.error);
      } else {
        setSelected(new Set());
        router.push("/investments");
      }
    });
  }

  function ripSelected() {
    if (selected.size === 0 || ripDate === "") return;
    setError(null);
    startTransition(async () => {
      const res = await bulkMarkOpened([...selected], ripDate);
      if (res.error) {
        setError(res.error);
      } else {
        setSelected(new Set());
        setRipOpen(false);
        router.push("/ripped");
      }
    });
  }

  function sellBundle() {
    if (selected.size === 0 || !bundleValid) return;
    setError(null);
    startTransition(async () => {
      const res = await bulkMarkSold([...selected], {
        sale_date: bundleDate,
        sale_platform: bundlePlatform,
        total_payout: bundleTotal,
        buyer: bundleBuyer,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setSelected(new Set());
        setBundleOpen(false);
        setBundlePlatform("");
        setBundleTotal("");
        setBundleBuyer("");
        router.push("/sales");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {dirtyItems.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-[18px] bg-warn-surface px-4 py-2.5 text-[13px] shadow-pill">
          <span className="font-semibold text-warn">
            {dirtyItems.length} unsaved value{dirtyItems.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={saveEdits}
            disabled={pending || invalidCount > 0}
            className={btnPrimary + " !py-2"}
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => setEdits({})}
            disabled={pending}
            className={btnText}
          >
            Discard
          </button>
          {invalidCount > 0 && (
            <span className="text-neg">
              Fix {invalidCount} invalid value{invalidCount === 1 ? "" : "s"}
            </span>
          )}
          {error && <span className="text-neg">{error}</span>}
        </div>
      )}

      <ToolbarRow>
        <SearchField value={search} onChange={setSearch} placeholder="Search items…" />
        <>{toolbar}</>
        {search && (
          <SearchCount
            shown={visible.length}
            total={items.length}
            onClear={() => setSearch("")}
          />
        )}
        <span className="grow" />
        <MobileSort
          options={[
            { key: "name", label: "Name" },
            { key: "category", label: "Type" },
            { key: "purchase_price", label: "Cost" },
            { key: "est_value", label: "Est. value" },
            { key: "purchase_date", label: "Purchased" },
          ]}
          activeKey={sortKey}
          dir={sortDir}
          onSort={toggleSort}
        />
        <>{action}</>
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
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.name}`}
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="mt-1 h-5 w-5 shrink-0 accent-accent"
                  />
                  <span
                    className="h-9 w-2 shrink-0 rounded"
                    style={{ background: categoryHue(item.category) }}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/inventory/${item.id}`}
                      className="font-semibold hover:underline"
                    >
                      {item.name}
                    </Link>
                    <div className="cap mt-0.5">{detailLine(item)}</div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
                      <span className="tnum font-semibold text-ink">
                        {formatMoney(costBasis(item))}
                      </span>
                      {item.purchase_platform && <span>{item.purchase_platform}</span>}
                      {item.purchase_date && (
                        <span className="tnum">{formatDate(item.purchase_date)}</span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                      <label className="flex items-center gap-2">
                        <span className="text-muted">Est. value</span>
                        <EstInput
                          item={item}
                          value={estInput(item)}
                          dirty={itemDirty(item)}
                          onChange={(v) => setEst(item.id, v)}
                        />
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={item.listed}
                          disabled={pending}
                          onChange={() => toggleListed(item)}
                          className="h-4 w-4 accent-[var(--pos)]"
                        />
                        <span className="text-muted">Listed</span>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 pl-8">
                  <Link href={`/inventory/${item.id}/sell`} className={btnRow}>
                    Sell
                  </Link>
                  <a
                    href={marketLink(item).url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={btnRow}
                  >
                    Value ↗
                  </a>
                  <Link href={`/inventory/${item.id}`} className={btnRow}>
                    Edit
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-inset">
                    <th className="w-[46px] py-3 pl-5">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="h-4 w-4 accent-accent"
                      />
                    </th>
                    <SortHeader label="Item" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Bought" sortKey="purchase_date" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Cost" sortKey="purchase_price" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <SortHeader label="Est. value" sortKey="est_value" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <th className={`${th} text-center`}>Listed</th>
                    <th className="py-3 pl-3.5 pr-5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => {
                    const picked = selected.has(item.id);
                    return (
                      <tr key={item.id} className={picked ? "bg-inset" : ""}>
                        <td className="border-t border-line py-[15px] pl-5 align-top">
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.name}`}
                            checked={picked}
                            onChange={() => toggle(item.id)}
                            className="h-4 w-4 accent-accent"
                          />
                        </td>
                        <td className={td}>
                          <div className="flex items-center gap-3">
                            <span
                              className="h-8 w-2 shrink-0 rounded"
                              style={{ background: categoryHue(item.category) }}
                            />
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
                          {formatMoney(costBasis(item))}
                        </td>
                        <td className={`${td} text-right`}>
                          <EstInput
                            item={item}
                            value={estInput(item)}
                            dirty={itemDirty(item)}
                            onChange={(v) => setEst(item.id, v)}
                          />
                        </td>
                        <td className={`${td} text-center`}>
                          <input
                            type="checkbox"
                            aria-label={`Listed: ${item.name}`}
                            checked={item.listed}
                            disabled={pending}
                            onChange={() => toggleListed(item)}
                            className="h-4 w-4 accent-[var(--pos)]"
                          />
                        </td>
                        <td className="whitespace-nowrap border-t border-line py-3.5 pl-3.5 pr-5 text-right">
                          <Link href={`/inventory/${item.id}/sell`} className={btnRow}>
                            Sell
                          </Link>
                          <span className="ml-1.5 inline-block align-middle">
                            <Menu
                              label={`More actions for ${item.name}`}
                              buttonClass={rowMenuButton}
                              buttonContent={<DotsIcon />}
                            >
                              <Link
                                href={`/inventory/${item.id}`}
                                data-close
                                className={menuItem}
                              >
                                Edit item
                              </Link>
                              <a
                                href={marketLink(item).url}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-close
                                className={menuItem}
                              >
                                Look up value on {marketLink(item).label} ↗
                              </a>
                            </Menu>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selected.size > 0 && (
        <SelectionDock>
          <span className="whitespace-nowrap text-[13px] font-semibold">
            {selected.size} selected
          </span>
          <span className="tnum whitespace-nowrap text-[13px] text-dock-muted">
            {formatMoney(pickedCost)} cost
          </span>
          <span className={dockDivider} />
          <button
            type="button"
            onClick={() => {
              setError(null);
              setBundleOpen(true);
            }}
            disabled={pending}
            className={dockPrimary}
          >
            Sell together
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setRipOpen(true);
            }}
            disabled={pending}
            className={dockButton}
          >
            Rip open
          </button>
          <button
            type="button"
            onClick={moveToInvestments}
            disabled={pending}
            className={dockButton}
          >
            To investments
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
                list="bulk-categories"
                placeholder="Category…"
                aria-label="New category"
                className={`${field} !py-2`}
              />
              <datalist id="bulk-categories">
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <button
                type="button"
                data-close
                onClick={applyCategory}
                disabled={pending || category.trim() === ""}
                className={btnRow + " whitespace-nowrap"}
              >
                Set
              </button>
            </div>
            <button
              type="button"
              data-close
              onClick={keepPersonal}
              disabled={pending}
              className={menuItem}
            >
              Keep (personal collection)
            </button>
            <button
              type="button"
              data-close
              onClick={deleteSelected}
              disabled={pending}
              className={`${menuItem} !text-neg`}
            >
              {pending ? "Working…" : "Delete selected"}
            </button>
          </Menu>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className={dockClear}
          >
            Clear
          </button>
          {error && <span className="text-[13px] text-[#ffb4ab]">{error}</span>}
        </SelectionDock>
      )}

      {ripOpen && (
        <div className={modalOverlay}>
          <div className={modalPanel}>
            <h2 className="disp text-lg font-bold">
              Rip open {selected.size} item{selected.size === 1 ? "" : "s"}?
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              This moves {selected.size === 1 ? "it" : "them"} out of inventory
              into <span className="font-medium">Opened</span>, keeping the
              cost. Add whatever you pull as separate items.
            </p>
            <label className="mt-4 block">
              <span className={fieldLabel}>Date opened</span>
              <input
                type="date"
                value={ripDate}
                onChange={(e) => setRipDate(e.target.value)}
                className={field}
              />
            </label>

            {error && <p className="mt-3 text-sm text-neg">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setRipOpen(false)}
                className={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || ripDate === ""}
                onClick={ripSelected}
                className={btnPrimary}
              >
                {pending ? "Opening…" : "Rip open"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bundleOpen && (
        <div className={modalOverlay}>
          <div className={modalPanel}>
            <h2 className="disp text-lg font-bold">
              Sell {selected.size} items together
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Enter one total payout — it&apos;s split evenly across the{" "}
              {selected.size} items. Each keeps its own cost.
            </p>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className={fieldLabel}>Sale date</span>
                <input
                  type="date"
                  value={bundleDate}
                  onChange={(e) => setBundleDate(e.target.value)}
                  className={field}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>Platform</span>
                <input
                  value={bundlePlatform}
                  onChange={(e) => setBundlePlatform(e.target.value)}
                  list="bundle-platforms"
                  placeholder="eBay, Whatnot… (optional)"
                  className={field}
                />
                <datalist id="bundle-platforms">
                  {PLATFORM_SUGGESTIONS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>
              <label className="block">
                <span className={fieldLabel}>Total payout</span>
                <input
                  type="number"
                  step="0.01"
                  value={bundleTotal}
                  onChange={(e) => setBundleTotal(e.target.value)}
                  placeholder="Total received after fees"
                  className={field}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>Buyer (name / username)</span>
                <input
                  value={bundleBuyer}
                  onChange={(e) => setBundleBuyer(e.target.value)}
                  placeholder="Who bought it — optional"
                  className={field}
                />
              </label>
              {bundlePerItem !== null && (
                <p className="text-[13px] text-muted">
                  ≈ {formatMoney(bundlePerItem)} per item (split to the cent)
                </p>
              )}
            </div>

            {error && <p className="mt-3 text-sm text-neg">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setBundleOpen(false)}
                className={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || !bundleValid}
                onClick={sellBundle}
                className={btnPrimary}
              >
                {pending ? "Selling…" : "Record bundle sale"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline est-value box; turns amber while it holds an unsaved change. */
function EstInput({
  item,
  value,
  dirty,
  onChange,
}: {
  item: Item;
  value: string;
  dirty: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
      aria-label={`Estimated value for ${item.name}`}
      className={`no-spinner tnum w-[94px] rounded-[10px] border bg-surface px-[11px] py-2 text-right text-[13px] text-ink ${
        dirty ? "border-warn ring-2 ring-warn-surface" : "border-edge"
      }`}
    />
  );
}
