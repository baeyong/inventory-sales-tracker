import { describe, expect, it } from "vitest";
import { planClose, writeDown, type CloseCandidate } from "./writedown";

describe("writeDown", () => {
  it("writes the basis down to market when market is lower", () => {
    expect(writeDown(1000, 400)).toEqual({ basisAfterCents: 400, writedownCents: 600 });
  });

  it("never writes up", () => {
    expect(writeDown(1000, 5000)).toEqual({ basisAfterCents: 1000, writedownCents: 0 });
  });

  it("leaves an item at exactly its basis alone", () => {
    expect(writeDown(1000, 1000)).toEqual({ basisAfterCents: 1000, writedownCents: 0 });
  });

  it("allows writing down to zero", () => {
    expect(writeDown(750, 0)).toEqual({ basisAfterCents: 0, writedownCents: 750 });
  });

  it("changes nothing without a market value", () => {
    expect(writeDown(1000, null)).toEqual({ basisAfterCents: 1000, writedownCents: 0 });
  });

  it("rejects negative or fractional market values", () => {
    expect(() => writeDown(1000, -1)).toThrow(RangeError);
    expect(() => writeDown(1000, 1.5)).toThrow(RangeError);
  });

  it("chains across years: next year starts from the written-down basis", () => {
    const y1 = writeDown(1000, 600);
    const y2 = writeDown(y1.basisAfterCents, 450);
    const y3 = writeDown(y2.basisAfterCents, 900); // recovered — still no write-up
    expect([y1.writedownCents, y2.writedownCents, y3.writedownCents]).toEqual([400, 150, 0]);
    expect(y3.basisAfterCents).toBe(450);
  });
});

describe("planClose", () => {
  const c = (id: string, basisCents: number, locked: string | null = null): CloseCandidate => ({
    kind: "item",
    id,
    name: id,
    category: null,
    basisCents,
    estimateCents: null,
    locked,
  });

  it("totals basis, market, write-downs and ending inventory", () => {
    const plan = planClose([c("a", 1000), c("b", 2000), c("c", 500)], {
      "item:a": 300, // down 700
      "item:b": 2500, // above cost, no change
      "item:c": null, // blank → basis
    });
    expect(plan.lines.map((l) => l.writedownCents)).toEqual([700, 0, 0]);
    expect(plan.lines.map((l) => l.marketEntered)).toEqual([true, true, false]);
    expect(plan.basisBeforeCents).toBe(3500);
    expect(plan.marketCents).toBe(300 + 2500 + 500);
    expect(plan.writedownCents).toBe(700);
    expect(plan.endingCents).toBe(300 + 2000 + 500);
  });

  it("ignores a market value on a locked row", () => {
    const plan = planClose([c("a", 1000, "opened")], { "item:a": 1 });
    expect(plan.lines[0]).toMatchObject({ writedownCents: 0, basisAfterCents: 1000, marketEntered: false });
  });
});
