import { describe, expect, it } from "vitest";
import { allocateLot, defaultSellable, type AllocationInput } from "./allocation";

const sellable = (key: string, valueCents: number): AllocationInput => ({
  key,
  valueCents,
  sellable: true,
});
const bulk = (key: string, valueCents: number): AllocationInput => ({
  key,
  valueCents,
  sellable: false,
});
const costs = (lines: { costCents: number }[]) => lines.map((l) => l.costCents);
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

describe("allocateLot", () => {
  it("splits by relative market value", () => {
    // $30 box: a $60 card and a $30 card → $20 and $10.
    const a = allocateLot(3000, [sellable("a", 6000), sellable("b", 3000)]);
    expect(costs(a.lines)).toEqual([2000, 1000]);
    expect(a.sellableValueCents).toBe(9000);
    expect(a.lossCents).toBe(0);
  });

  it("puts the rounding remainder on the highest-value item", () => {
    // 1000 × 100/600 = 166.67, × 300/600 = 500, × 200/600 = 333.33
    // floors: 166 + 500 + 333 = 999 → the extra cent goes to the $3 card.
    const a = allocateLot(1000, [sellable("a", 100), sellable("b", 300), sellable("c", 200)]);
    expect(costs(a.lines)).toEqual([166, 501, 333]);
    expect(sum(costs(a.lines))).toBe(1000);
  });

  it("breaks a value tie in favour of the first item listed", () => {
    const a = allocateLot(1000, [sellable("a", 500), sellable("b", 500), sellable("c", 500)]);
    expect(costs(a.lines)).toEqual([334, 333, 333]);
  });

  it("can put more than one cent of remainder on the top item", () => {
    const lines = [sellable("top", 2), ...Array.from({ length: 6 }, (_, i) => sellable(`s${i}`, 1))];
    const a = allocateLot(100, lines);
    // top: 100×2/8 = 25, others 100×1/8 = 12.5 → 12 each = 72; 25+72 = 97 → +3 to top.
    expect(a.lines[0].costCents).toBe(28);
    expect(sum(costs(a.lines))).toBe(100);
  });

  it("gives bulk $0 and leaves it out of the denominator", () => {
    const a = allocateLot(3000, [sellable("a", 6000), bulk("b", 200), sellable("c", 3000)]);
    expect(costs(a.lines)).toEqual([2000, 0, 1000]);
    expect(a.sellableValueCents).toBe(9000);
  });

  it("records the whole cost as a loss when nothing is sellable", () => {
    const a = allocateLot(2500, [bulk("a", 100), bulk("b", 50)]);
    expect(costs(a.lines)).toEqual([0, 0]);
    expect(a.lossCents).toBe(2500);
    expect(a.sellableValueCents).toBe(0);
  });

  it("records a loss for an opened lot with no items at all", () => {
    expect(allocateLot(1999, [])).toEqual({ lines: [], sellableValueCents: 0, lossCents: 1999 });
  });

  it("gives a single sellable item the whole cost", () => {
    expect(costs(allocateLot(4321, [sellable("a", 1), bulk("b", 0)]).lines)).toEqual([4321, 0]);
  });

  it("handles a free lot", () => {
    expect(costs(allocateLot(0, [sellable("a", 500), sellable("b", 100)]).lines)).toEqual([0, 0]);
  });

  it("stays exact on numbers too big for floating-point multiplication", () => {
    const a = allocateLot(1_000_000_000_000, [sellable("a", 3_333_333_333), sellable("b", 6_666_666_667)]);
    expect(sum(costs(a.lines))).toBe(1_000_000_000_000);
  });

  it("always adds back to the basis and never strays more than the remainder", () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let run = 0; run < 500; run++) {
      const basis = rand(500_000);
      const n = 1 + rand(12);
      const lines = Array.from({ length: n }, (_, i) =>
        rand(4) === 0 ? bulk(`${i}`, rand(300)) : sellable(`${i}`, 1 + rand(100_000))
      );
      const a = allocateLot(basis, lines);
      const total = a.sellableValueCents;
      if (total === 0) {
        expect(a.lossCents).toBe(basis);
        continue;
      }
      expect(sum(costs(a.lines))).toBe(basis);
      a.lines.forEach((l) => {
        if (!l.sellable) {
          expect(l.costCents).toBe(0);
          return;
        }
        const ideal = (basis * l.valueCents) / total;
        expect(l.costCents).toBeGreaterThanOrEqual(Math.floor(ideal));
        expect(l.costCents).toBeLessThan(Math.floor(ideal) + n + 1);
      });
    }
  });

  it("rejects a sellable item with no value", () => {
    expect(() => allocateLot(1000, [sellable("a", 0)])).toThrow(/mark it bulk/);
  });

  it("rejects fractional or negative cents", () => {
    expect(() => allocateLot(10.5, [sellable("a", 1)])).toThrow(RangeError);
    expect(() => allocateLot(1000, [sellable("a", -5)])).toThrow(RangeError);
  });
});

describe("defaultSellable", () => {
  it("defaults anything under the threshold to bulk", () => {
    expect(defaultSellable(299, 300)).toBe(false);
    expect(defaultSellable(300, 300)).toBe(true);
    expect(defaultSellable(0, 0)).toBe(true);
  });
});
