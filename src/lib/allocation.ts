// Lot cost allocation: spreading what a sealed box cost across the items
// pulled from it, by relative market value. Pure functions, all in integer
// cents, shared by the open-a-lot preview (browser) and the server action that
// saves it, so what you confirm is exactly what gets stored.

export const DEFAULT_BULK_THRESHOLD_CENTS = 300;

export type AllocationInput = {
  /** Anything that identifies the row to the caller (form row key, item id). */
  key: string;
  valueCents: number;
  sellable: boolean;
};

export type AllocatedLine = AllocationInput & { costCents: number };

export type Allocation = {
  lines: AllocatedLine[];
  /** Sum of the sellable rows' values — the denominator. */
  sellableValueCents: number;
  /** The whole basis when nothing is sellable: an immediate loss. */
  lossCents: number;
};

/** A pulled item starts out as bulk when it is worth less than the threshold. */
export function defaultSellable(valueCents: number, thresholdCents: number): boolean {
  return valueCents >= thresholdCents;
}

/** Why an allocation can't be made, or null when the input is fine. */
export function allocationProblem(
  basisCents: number,
  lines: AllocationInput[]
): string | null {
  if (!Number.isSafeInteger(basisCents) || basisCents < 0) {
    return "The lot's cost must be a whole number of cents, 0 or more.";
  }
  for (const l of lines) {
    if (!Number.isSafeInteger(l.valueCents) || l.valueCents < 0) {
      return "Values must be whole cents, 0 or more.";
    }
    if (l.sellable && l.valueCents === 0) {
      return "A sellable item needs a market value above $0 — mark it bulk instead.";
    }
  }
  return null;
}

/**
 * item cost = basis × (item value ÷ sum of sellable values), floored to the
 * cent. The cents lost to flooring go to the highest-value sellable item (the
 * first one listed, on a tie), so the costs add back up to the basis exactly.
 * Bulk items cost $0. With nothing sellable the whole basis is a loss.
 *
 * Uses BigInt for the multiply so a big lot times a big value can't lose
 * precision past 2^53.
 */
export function allocateLot(
  basisCents: number,
  lines: AllocationInput[]
): Allocation {
  const problem = allocationProblem(basisCents, lines);
  if (problem) throw new RangeError(problem);

  const sellableValue = lines.reduce(
    (s, l) => (l.sellable ? s + l.valueCents : s),
    0
  );

  if (sellableValue === 0) {
    return {
      lines: lines.map((l) => ({ ...l, costCents: 0 })),
      sellableValueCents: 0,
      lossCents: basisCents,
    };
  }

  const basis = BigInt(basisCents);
  const total = BigInt(sellableValue);
  const out: AllocatedLine[] = lines.map((l) => ({
    ...l,
    costCents: l.sellable ? Number((basis * BigInt(l.valueCents)) / total) : 0,
  }));

  const allocated = out.reduce((s, l) => s + l.costCents, 0);
  const remainder = basisCents - allocated; // 0 ≤ remainder < number of sellable rows
  if (remainder !== 0) {
    let top = -1;
    out.forEach((l, i) => {
      if (l.sellable && (top === -1 || l.valueCents > out[top].valueCents)) top = i;
    });
    out[top] = { ...out[top], costCents: out[top].costCents + remainder };
  }

  return { lines: out, sellableValueCents: sellableValue, lossCents: 0 };
}
