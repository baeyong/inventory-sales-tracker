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

/** Numbers keyed by grade ("10", "9"…) and, for values, "raw". */
export type GradeMap = Record<string, number>;

/** What an item cost all-in: its purchase price plus any grading fee. Profit
 * is always measured against this, never against purchase_price alone. */
export function costBasis(
  item: Pick<Item, "purchase_price" | "grading_cost">
): number {
  return Number(item.purchase_price) + Number(item.grading_cost ?? 0);
}

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
  ripped_from_id: string | null; // the ripped box this was pulled from, null = bought on its own
  invested_at: string | null; // YYYY-MM-DD moved to Investments, null = normal inventory
  personal_at: string | null; // YYYY-MM-DD moved to Personal Collection, null = not a keeper
  market_platform: string | null; // marketplace key for value lookup (null = category default)
  market_search: string | null; // search-words or full-URL override (null = auto)
  grading_cost: number | null; // fee paid to grade it (null = never sent in)
  grade_plan_cost: number | null; // expected fee, for the "worth it?" maths only
  plan_to_grade: boolean; // a raw card being weighed up for grading
  grade_values: GradeMap | null; // worth at each grade, plus "raw"
  grade_odds: GradeMap | null; // % chance of each grade
  grade_pop: GradeMap | null; // pop counts per grade, for reference
  grading_submitted_at: string | null; // YYYY-MM-DD sent to the grader
  grading_returned_at: string | null; // YYYY-MM-DD back from the grader
  grade_predicted: string | null; // the grade expected when sent in
  cert_number: string | null;
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
