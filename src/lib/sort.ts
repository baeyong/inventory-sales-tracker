import type { Expense, Item } from "./types";

export type SortKey =
  | "name"
  | "category"
  | "purchase_platform"
  | "purchase_price"
  | "purchase_date"
  | "opened_at"
  | "sale_date"
  | "sale_payout"
  | "profit";

export type SortDir = "asc" | "desc";

/** Compare two sortable values; nulls (missing dates/payouts/text) always sort
 * to the end regardless of direction. */
export function compareForSort(
  av: string | number | null,
  bv: string | number | null,
  dir: SortDir
): number {
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  if (av < bv) return dir === "asc" ? -1 : 1;
  if (av > bv) return dir === "asc" ? 1 : -1;
  return 0;
}

/** Sort a copy of `rows` by an accessor, nulls last. */
export function sortBy<T>(
  rows: T[],
  getValue: (row: T) => string | number | null,
  dir: SortDir
): T[] {
  return [...rows].sort((a, b) => compareForSort(getValue(a), getValue(b), dir));
}

function itemValue(item: Item, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return item.name.toLowerCase();
    case "category":
      return item.category.toLowerCase();
    case "purchase_platform":
      return item.purchase_platform
        ? item.purchase_platform.toLowerCase()
        : null;
    case "purchase_price":
      return Number(item.purchase_price);
    case "purchase_date":
      return item.purchase_date;
    case "opened_at":
      return item.opened_at;
    case "sale_date":
      return item.sale_date;
    case "sale_payout":
      return item.sale_payout === null ? null : Number(item.sale_payout);
    case "profit":
      return item.sale_payout === null
        ? null
        : Number(item.sale_payout) - Number(item.purchase_price);
  }
}

export function sortItems(
  items: Item[],
  key: SortKey | null,
  dir: SortDir
): Item[] {
  if (!key) return items;
  return sortBy(items, (i) => itemValue(i, key), dir);
}

export type ExpenseSortKey = "name" | "amount" | "spent_on" | "source";

function expenseValue(
  e: Expense,
  key: ExpenseSortKey
): string | number | null {
  switch (key) {
    case "name":
      return e.name.toLowerCase();
    case "amount":
      return Number(e.amount);
    case "spent_on":
      return e.spent_on;
    case "source":
      return e.source ? e.source.toLowerCase() : null;
  }
}

export function sortExpenses(
  rows: Expense[],
  key: ExpenseSortKey | null,
  dir: SortDir
): Expense[] {
  if (!key) return rows;
  return sortBy(rows, (e) => expenseValue(e, key), dir);
}
