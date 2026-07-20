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
  payment_received: boolean;
  shipped: boolean;
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
