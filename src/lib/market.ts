import { isCardCategory, type Item } from "@/lib/types";

// A marketplace we can deep-link a search to. `build` turns a query into the
// URL that opens that search. All free to view — no API, no scraping.
export type Platform = {
  key: string;
  label: string;
  build: (query: string) => string;
};

const q = (s: string) => encodeURIComponent(s.trim());

export const PLATFORMS: Record<string, Platform> = {
  ebay_sold: {
    key: "ebay_sold",
    label: "eBay (sold)",
    // Sold + completed = real transaction prices, the truest value signal.
    build: (s) =>
      `https://www.ebay.com/sch/i.html?_nkw=${q(s)}&LH_Sold=1&LH_Complete=1`,
  },
  ebay_active: {
    key: "ebay_active",
    label: "eBay (active)",
    build: (s) => `https://www.ebay.com/sch/i.html?_nkw=${q(s)}`,
  },
  stockx: {
    key: "stockx",
    label: "StockX",
    build: (s) => `https://stockx.com/search?s=${q(s)}`,
  },
  goat: {
    key: "goat",
    label: "GOAT",
    build: (s) => `https://www.goat.com/search?query=${q(s)}`,
  },
  tcgplayer: {
    key: "tcgplayer",
    label: "TCGplayer",
    build: (s) => `https://www.tcgplayer.com/search/all/product?q=${q(s)}`,
  },
  pricecharting: {
    key: "pricecharting",
    label: "PriceCharting",
    build: (s) =>
      `https://www.pricecharting.com/search-products?q=${q(s)}&type=prices`,
  },
  onethirtypoint: {
    key: "onethirtypoint",
    label: "130point",
    // 130point's sold-search tool is POST-only, so this opens the tool where
    // you paste the query (shown alongside the link).
    build: () => `https://130point.com/sales/`,
  },
};

/** Order shown in the platform dropdown. */
export const PLATFORM_OPTIONS: Platform[] = [
  PLATFORMS.ebay_sold,
  PLATFORMS.ebay_active,
  PLATFORMS.stockx,
  PLATFORMS.goat,
  PLATFORMS.tcgplayer,
  PLATFORMS.pricecharting,
  PLATFORMS.onethirtypoint,
];

/** Sensible default marketplace for a category when the item hasn't overridden
 * it. Cards/most goods → eBay sold comps; sneakers → StockX. */
export function defaultPlatformForCategory(category: string): string {
  if (/sneaker|shoe/i.test(category)) return "stockx";
  return "ebay_sold";
}

/** Search words built from an item's own fields — the starting point the user
 * can tweak. */
export function autoQuery(item: Item): string {
  const parts: (string | null | undefined)[] = [item.name];
  if (isCardCategory(item.category)) {
    if (item.card_number) parts.push(`#${item.card_number}`);
    if (item.condition === "graded") {
      const grade = `${item.grade_company ?? ""} ${item.grade ?? ""}`.trim();
      if (grade) parts.push(grade);
    }
  }
  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export type MarketLink = {
  label: string;
  url: string;
  /** The query we searched (empty when a full URL override is used). */
  query: string;
  /** True when the override is a pasted URL rather than search words. */
  custom: boolean;
};

/** Resolve the market-value link for an item: a pasted URL wins; otherwise the
 * override (or auto) query on the chosen (or category-default) platform. */
export function marketLink(item: Item): MarketLink {
  const override = item.market_search?.trim() ?? "";
  if (/^https?:\/\//i.test(override)) {
    return { label: "Custom link", url: override, query: "", custom: true };
  }
  const query = override || autoQuery(item);
  const key = item.market_platform || defaultPlatformForCategory(item.category);
  const platform = PLATFORMS[key] ?? PLATFORMS.ebay_sold;
  return { label: platform.label, url: platform.build(query), query, custom: false };
}
