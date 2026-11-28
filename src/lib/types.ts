export type CardCondition = "raw" | "graded";

/** Card-detail fields (set, number, grade…) apply when the category name
 * mentions cards. */
export function isCardCategory(category: string): boolean {
  return /card/i.test(category);
}

/** Sneaker fields (style code) apply when the category is about shoes. */
export function isSneakerCategory(category: string): boolean {
  return /sneaker|shoe/i.test(category);
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

/** What grading cost one card: its share of the grader's fee plus its share of
 * the shipping to send the submission in. */
export function gradingSpend(
  item: Pick<Item, "grading_cost" | "grading_shipping">
): number {
  return Number(item.grading_cost ?? 0) + Number(item.grading_shipping ?? 0);
}

/** What an item cost all-in: its purchase price plus any grading fee and
 * shipping, less any year-end write-down. Profit is always measured against
 * this, never against purchase_price alone.
 *
 * writedown_cents is optional here so callers holding a partial item still
 * type-check; it is 0 on every item until a year-end close writes it down. */
export function costBasis(
  item: Pick<Item, "purchase_price" | "grading_cost" | "grading_shipping"> & {
    writedown_cents?: number | null;
  }
): number {
  return (
    Number(item.purchase_price) +
    gradingSpend(item) -
    Number(item.writedown_cents ?? 0) / 100
  );
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
  style_code: string | null; // sneaker SKU, e.g. "DZ5485-612"
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
  grading_cost: number | null; // grader's fee for it (null = never sent in)
  grading_shipping: number | null; // its share of shipping the submission in
  grade_plan_cost: number | null; // expected fee, for the "worth it?" maths only
  plan_to_grade: boolean; // a raw card being weighed up for grading
  grade_values: GradeMap | null; // worth at each grade, plus "raw"
  grade_odds: GradeMap | null; // % chance of each grade
  grade_pop: GradeMap | null; // pop counts per grade, for reference
  grading_submitted_at: string | null; // YYYY-MM-DD sent to the grader
  submission_id: string | null; // shared by the cards sent in together
  grading_returned_at: string | null; // YYYY-MM-DD back from the grader
  grade_predicted: string | null; // the grade expected when sent in
  cert_number: string | null;
  lot_id: string | null; // the lot it was opened out of; its cost is locked by that lot's allocation
  writedown_cents: number; // total year-end write-downs, taken off its cost basis
  sale_gross_cents: number | null; // sale price before fees, when entered
  sale_fees_cents: number | null; // platform fees on the sale
  sale_shipping_cents: number | null; // shipping paid on the sale
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

// ---------------------------------------------------------------------------
// Lots, year-end close and transfers. Money in these tables is integer cents.

/** A sealed purchase (box, pack, lot) that gets opened into items. Unopened,
 * it is inventory in its own right at its full cost. */
export interface Lot {
  id: string;
  user_id: string;
  name: string;
  category: string; // default category for what gets pulled from it
  purchased_on: string; // YYYY-MM-DD
  purchase_platform: string | null;
  total_cost_cents: number; // all-in: price + tax + shipping
  notes: string | null;
  receipt_path: string | null; // object path in the private "receipts" bucket
  est_value_cents: number | null; // market value while unopened
  writedown_cents: number; // year-end write-downs while unopened
  opened_on: string | null; // null = unopened
  bulk_count: number;
  bulk_note: string | null;
  created_at: string;
  updated_at: string;
}

/** One item's share in an allocation. item_id is null only for loss-only
 * allocations, which have no items. */
export interface AllocationLine {
  item_id: string | null;
  name: string;
  value_cents: number;
  sellable: boolean;
  cost_cents: number;
}

/** One run of a lot's cost allocation. Version 1 is the open; later versions
 * are re-allocations, which must carry a reason. Never edited or deleted. */
export interface LotAllocation {
  id: string;
  user_id: string;
  lot_id: string;
  version: number;
  allocated_on: string;
  reason: string | null;
  basis_cents: number;
  threshold_cents: number;
  sellable_value_cents: number;
  loss_cents: number; // whole basis when nothing was sellable
  bulk_count: number;
  lines: AllocationLine[];
  created_at: string;
}

export interface YearEndClose {
  id: string;
  user_id: string;
  tax_year: number;
  closed_on: string;
  basis_before_cents: number;
  market_cents: number;
  writedown_cents: number;
  ending_cents: number; // ending inventory after write-downs
  reopened_at: string | null; // set = superseded, its write-downs reversed
  reopen_reason: string | null;
  created_at: string;
}

export interface YearEndLine {
  id: string;
  user_id: string;
  close_id: string;
  kind: "item" | "lot";
  item_id: string | null;
  lot_id: string | null;
  name: string;
  category: string | null;
  basis_before_cents: number;
  market_cents: number;
  writedown_cents: number;
  basis_after_cents: number;
}

/** A move between business inventory and the Personal Collection, at the
 * item's basis on the day it moved. */
export interface InventoryTransfer {
  id: string;
  user_id: string;
  item_id: string | null;
  name: string;
  direction: "to_personal" | "to_inventory";
  transferred_on: string;
  basis_cents: number;
  created_at: string;
}
