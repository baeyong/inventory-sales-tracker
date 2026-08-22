export type CardCondition = "raw" | "graded";

/** Card-detail fields (set, number, grade…) apply when the category name
 * mentions cards. */
export function isCardCategory(category: string): boolean {
  return /card/i.test(category);
}

export const DEFAULT_CATEGORIES = [
  "General",
  "Personal Collection",
  "Sneakers",
  "Clothing",
  "Sports Cards",
  "Pokémon Cards",
  "TCG Sealed",
  "Funko Pops",
  "Electronics",
  "Toys",
  "Collectibles",
];

export interface Item {
  id: string;
  user_id: string;
  category: string;
  name: string;
  description: string | null;
  purchase_price: number;
  purchase_date: string | null; // YYYY-MM-DD
  purchase_platform: string | null; // where it was bought
  est_value: number | null; // hand-entered current worth, null = not valued
  listed: boolean; // listed for sale yet?
  quantity: number;
  card_set: string | null;
  card_number: string | null;
  player: string | null;
  condition: CardCondition | null;
  grade_company: string | null;
  grade: string | null;
  sale_date: string | null; // YYYY-MM-DD, null = unsold
  sale_platform: string | null;
  sale_payout: number | null;
  buyer: string | null; // who it was sold to (name/username)
  payment_received: boolean;
  shipped: boolean;
  bundle_id: string | null; // shared across items sold together
  opened_at: string | null; // YYYY-MM-DD it was ripped open, null = not opened
  market_platform: string | null; // marketplace key for value lookup (null = category default)
  market_search: string | null; // search-words or full-URL override (null = auto)
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  spent_on: string | null; // YYYY-MM-DD, when it was bought
  source: string | null; // where it was bought from
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const PLATFORM_SUGGESTIONS = [
  "eBay",
  "Whatnot",
  "In Person",
  "Facebook Marketplace",
  "Mercari",
  "COMC",
  "Other",
];

export const GRADE_COMPANIES = ["PSA", "BGS", "SGC", "CGC"];

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
