// Year-end lower-of-cost-or-market. Pure, integer cents.

export type WriteDown = { basisAfterCents: number; writedownCents: number };

/** If market is below basis, write the basis down to market; otherwise leave
 * it alone — never write up. A null market (no estimate) changes nothing. */
export function writeDown(basisCents: number, marketCents: number | null): WriteDown {
  if (marketCents !== null && (!Number.isSafeInteger(marketCents) || marketCents < 0)) {
    throw new RangeError("Market value must be whole cents, 0 or more.");
  }
  if (marketCents === null || marketCents >= basisCents) {
    return { basisAfterCents: basisCents, writedownCents: 0 };
  }
  return { basisAfterCents: marketCents, writedownCents: basisCents - marketCents };
}

/** Something on hand at year end, as the close screen lists it. */
export type CloseCandidate = {
  kind: "item" | "lot";
  id: string;
  name: string;
  category: string | null;
  basisCents: number;
  /** Latest estimate, used to pre-fill the market field. */
  estimateCents: number | null;
  /** Set when this row can't be written down, with the reason. */
  locked: string | null;
};

export type PlannedLine = CloseCandidate & {
  /** The market value used: the one entered, or the basis when left blank. */
  marketCents: number;
  /** The user entered a market value (so it should become the new estimate). */
  marketEntered: boolean;
  writedownCents: number;
  basisAfterCents: number;
};

export type ClosePlan = {
  lines: PlannedLine[];
  basisBeforeCents: number;
  marketCents: number;
  writedownCents: number;
  endingCents: number;
};

/** Apply entered market values (keyed `${kind}:${id}`, null = blank) to the
 * candidates. Locked rows and blank fields keep their basis. */
export function planClose(
  candidates: CloseCandidate[],
  markets: Record<string, number | null>
): ClosePlan {
  const lines = candidates.map((c): PlannedLine => {
    const entered = c.locked ? null : (markets[`${c.kind}:${c.id}`] ?? null);
    const wd = writeDown(c.basisCents, entered);
    return {
      ...c,
      marketCents: entered ?? c.basisCents,
      marketEntered: entered !== null,
      writedownCents: wd.writedownCents,
      basisAfterCents: wd.basisAfterCents,
    };
  });
  const sum = (f: (l: PlannedLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  return {
    lines,
    basisBeforeCents: sum((l) => l.basisCents),
    marketCents: sum((l) => l.marketCents),
    writedownCents: sum((l) => l.writedownCents),
    endingCents: sum((l) => l.basisAfterCents),
  };
}
