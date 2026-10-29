import { costBasis, type Item } from "./types";

// Grading money: what went into graded cards and what came back out. Only real
// figures — what was paid, sold for, or is held at its estimated value — and
// the held value is always kept apart from cash actually made.

/** Where a card stands in the grading flow. */
export type GradingStage = "candidate" | "submitted" | "returned";

export function gradingStage(item: Item): GradingStage | null {
  if (item.grading_returned_at) return "returned";
  if (item.grading_submitted_at) return "submitted";
  if (item.plan_to_grade) return "candidate";
  return null;
}

/** Fee a new submission starts on when you've never entered one: PSA's
 * Regular tier. */
export const FALLBACK_GRADING_COST = 80;

/** Value after grading minus what it was worth raw and the fee — how much
 * grading itself added. A sold card counts what it sold for. Null until both
 * values are known. */
export function gainVsRaw(item: Item): number | null {
  const raw = item.grade_values?.raw;
  const after =
    item.sale_date && item.sale_payout !== null
      ? Number(item.sale_payout)
      : item.est_value === null
        ? null
        : Number(item.est_value);
  if (raw === undefined || after === null) return null;
  return after - raw - Number(item.grading_cost ?? 0);
}

/** Totals for a group of cards that have been sent in. */
export type MoneyTotals = {
  cards: number;
  /** What the cards themselves cost. */
  cardCost: number;
  fees: number;
  /** cardCost + fees. */
  spent: number;
  sold: number;
  /** Net payouts from the ones sold. */
  revenue: number;
  /** Revenue minus the all-in cost of the ones sold. */
  profit: number;
  /** All-in cost of the ones sold, so profit has a base for its return %. */
  soldCost: number;
  held: number;
  /** Estimated value of graded cards still held (unvalued ones count 0). */
  heldValue: number;
  heldCost: number;
  /** Cards in this group still at the grader. */
  out: number;
  gainVsRaw: number;
  /** How many cards gainVsRaw covers. */
  gainCount: number;
};

function empty(): MoneyTotals {
  return {
    cards: 0,
    cardCost: 0,
    fees: 0,
    spent: 0,
    sold: 0,
    revenue: 0,
    profit: 0,
    soldCost: 0,
    held: 0,
    heldValue: 0,
    heldCost: 0,
    out: 0,
    gainVsRaw: 0,
    gainCount: 0,
  };
}

function add(t: MoneyTotals, item: Item) {
  const all = costBasis(item);
  t.cards++;
  t.cardCost += Number(item.purchase_price);
  t.fees += Number(item.grading_cost ?? 0);
  t.spent += all;
  if (item.sale_date && item.sale_payout !== null) {
    t.sold++;
    t.revenue += Number(item.sale_payout);
    t.profit += Number(item.sale_payout) - all;
    t.soldCost += all;
  } else if (item.grading_returned_at && !item.sale_date) {
    t.held++;
    t.heldValue += Number(item.est_value ?? 0);
    t.heldCost += all;
  } else if (!item.grading_returned_at) {
    t.out++;
  }
  const g = gainVsRaw(item);
  if (g !== null) {
    t.gainVsRaw += g;
    t.gainCount++;
  }
}

export function totals(items: Item[]): MoneyTotals {
  const t = empty();
  for (const i of items) add(t, i);
  return t;
}

export type BreakdownRow = MoneyTotals & { key: string; label: string };

/** Group cards by `keyOf` (null = leave the card out) into totals rows. */
export function breakdown(
  items: Item[],
  keyOf: (i: Item) => string | null,
  labelOf: (key: string) => string = (k) => k
): BreakdownRow[] {
  const groups = new Map<string, MoneyTotals>();
  for (const i of items) {
    const k = keyOf(i);
    if (k === null) continue;
    if (!groups.has(k)) groups.set(k, empty());
    add(groups.get(k)!, i);
  }
  return [...groups.entries()].map(([key, t]) => ({ ...t, key, label: labelOf(key) }));
}

/** Return on what was spent, as a fraction; null with nothing spent. */
export function returnRate(profit: number, cost: number): number | null {
  return cost > 0 ? profit / cost : null;
}

/** "10", "9.5", "Authentic" — best grades first, words last. */
export function compareGrades(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  const fa = Number.isFinite(na);
  const fb = Number.isFinite(nb);
  if (fa && fb) return nb - na;
  if (fa) return -1;
  if (fb) return 1;
  return a.localeCompare(b);
}
