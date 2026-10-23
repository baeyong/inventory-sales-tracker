import type { GradeMap, Item } from "./types";

// The "worth grading?" maths. Everything works from what the user typed in:
// the card's value at each grade and their % chance of getting each grade.

/** The grades tracked, best first. */
export const GRADES = ["10", "9", "8", "7", "6"] as const;

/** Where a card stands in the grading flow. */
export type GradingStage = "candidate" | "submitted" | "returned";

export function gradingStage(item: Item): GradingStage | null {
  if (item.grading_returned_at) return "returned";
  if (item.grading_submitted_at) return "submitted";
  if (item.plan_to_grade) return "candidate";
  return null;
}

/** Starting odds for the "how does it look?" shortcut. Rough guides for
 * modern cards, meant to be adjusted. */
export const ODDS_PRESETS: { label: string; odds: GradeMap }[] = [
  { label: "Pack-fresh", odds: { "10": 45, "9": 45, "8": 10 } },
  { label: "Looks clean", odds: { "10": 20, "9": 55, "8": 20, "7": 5 } },
  { label: "Minor flaws", odds: { "10": 5, "9": 30, "8": 40, "7": 20, "6": 5 } },
];

export type Verdict = "worth" | "borderline" | "skip";

export type GradingAnalysis = {
  raw: number;
  cost: number;
  /** Odds left over after 10–6: graded below a 6, treated as worth raw. */
  belowOdds: number;
  expectedValue: number;
  /** Expected value minus raw value minus the grading cost. */
  expectedProfit: number;
  /** The chance of a 10 needed to break even, keeping the other grades in
   * proportion; null when no chance of a 10 gets there (or none is needed). */
  breakEvenTen: number | null;
  /** The grade with the highest chance, for the prediction record. */
  likelyGrade: string | null;
  verdict: Verdict;
};

export type GradingInput = {
  values: GradeMap;
  odds: GradeMap;
  cost: number;
};

/** Why an analysis can't run yet, or null when it can. */
export function missingInputs({ values, odds }: GradingInput): string | null {
  if (values.raw === undefined) return "Enter what it's worth raw.";
  const total = GRADES.reduce((s, g) => s + (odds[g] ?? 0), 0);
  if (total === 0) return "Enter your chance of at least one grade.";
  if (total > 100) return `Your chances add up to ${total}% — keep them at 100% or under.`;
  const unpriced = GRADES.filter((g) => (odds[g] ?? 0) > 0 && values[g] === undefined);
  if (unpriced.length > 0) {
    return `Enter a value for ${unpriced.map((g) => `PSA ${g}`).join(", ")} — you've given it a chance.`;
  }
  return null;
}

export function analyse(input: GradingInput): GradingAnalysis | null {
  if (missingInputs(input)) return null;
  const { values, odds, cost } = input;
  const raw = values.raw;

  const p = (g: string) => (odds[g] ?? 0) / 100;
  const belowOdds = 1 - GRADES.reduce((s, g) => s + p(g), 0);
  const expectedValue =
    GRADES.reduce((s, g) => s + p(g) * (values[g] ?? 0), 0) + belowOdds * raw;
  const expectedProfit = expectedValue - raw - cost;

  // Expected value if it doesn't get a 10: the other outcomes, rescaled.
  const notTen = 1 - p("10");
  const evNotTen =
    notTen > 0 ? (expectedValue - p("10") * (values["10"] ?? 0)) / notTen : raw;
  const target = raw + cost;
  const ten = values["10"];
  let breakEvenTen: number | null = null;
  if (ten !== undefined && ten > evNotTen) {
    const need = (target - evNotTen) / (ten - evNotTen);
    breakEvenTen = need <= 0 ? 0 : need <= 1 ? need : null;
  }

  let likelyGrade: string | null = null;
  for (const g of GRADES) {
    if ((odds[g] ?? 0) > 0 && (likelyGrade === null || p(g) > p(likelyGrade))) {
      likelyGrade = g;
    }
  }

  // Within a fifth of the fee either way is too close to call.
  const margin = Math.max(cost * 0.2, 1);
  const verdict: Verdict =
    expectedProfit > margin ? "worth" : expectedProfit < -margin ? "skip" : "borderline";

  return {
    raw,
    cost,
    belowOdds,
    expectedValue,
    expectedProfit,
    breakEvenTen,
    likelyGrade,
    verdict,
  };
}

/** The fee to judge a card by: what was actually paid once it's sent in,
 * otherwise the planned fee, otherwise the default. */
export function feeFor(item: Item, defaultCost: number): number {
  if (item.grading_cost !== null) return Number(item.grading_cost);
  if (item.grade_plan_cost !== null) return Number(item.grade_plan_cost);
  return defaultCost;
}

/** Analysis straight from a saved item. */
export function analyseItem(item: Item, defaultCost: number): GradingAnalysis | null {
  return analyse({
    values: item.grade_values ?? {},
    odds: item.grade_odds ?? {},
    cost: feeFor(item, defaultCost),
  });
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  worth: "Worth grading",
  borderline: "Borderline",
  skip: "Not worth it",
};

/** Grading fee to start a new card on: the most recent fee you entered, or
 * PSA's Regular tier when there's no history yet. */
export const FALLBACK_GRADING_COST = 80;
