import type { Item } from "./types";

export type SortKey =
  | "name"
  | "category"
  | "purchase_price"
  | "purchase_date"
  | "sale_date"
  | "sale_payout"
  | "profit";

export type SortDir = "asc" | "desc";

function value(item: Item, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return item.name.toLowerCase();
    case "category":
      return item.category.toLowerCase();
    case "purchase_price":
      return Number(item.purchase_price);
    case "purchase_date":
      return item.purchase_date;
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

/** Sort a copy of `items` by `key`. Null values (missing dates/payouts)
 * always sort to the end regardless of direction. */
export function sortItems(
  items: Item[],
  key: SortKey | null,
  dir: SortDir
): Item[] {
  if (!key) return items;
  return [...items].sort((a, b) => {
    const av = value(a, key);
    const bv = value(b, key);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}
