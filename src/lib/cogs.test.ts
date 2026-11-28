import { describe, expect, it } from "vitest";
import {
  buildCogsCsv,
  buildCogsReport,
  inventoryAtYearEnd,
  type CogsAllocation,
  type CogsClose,
  type CogsCloseLine,
  type CogsItem,
  type CogsLot,
  type CogsTransfer,
  type TaxData,
} from "./cogs";
import { planClose } from "./writedown";

function item(id: string, o: Partial<CogsItem> = {}): CogsItem {
  return {
    id,
    name: id,
    category: "Pokémon Cards",
    purchase_price: 0,
    purchase_date: null,
    grading_cost: null,
    grading_shipping: null,
    grading_submitted_at: null,
    sale_date: null,
    sale_payout: null,
    sale_gross_cents: null,
    sale_fees_cents: null,
    sale_shipping_cents: null,
    opened_at: null,
    ripped_from_id: null,
    personal_at: null,
    lot_id: null,
    est_value: null,
    writedown_cents: 0,
    ...o,
  };
}
function lot(id: string, o: Partial<CogsLot> & Pick<CogsLot, "purchased_on" | "total_cost_cents">): CogsLot {
  return { id, name: id, category: "Pokémon Cards", est_value_cents: null, opened_on: null, ...o };
}
const data = (o: Partial<TaxData>): TaxData => ({
  items: [],
  lots: [],
  allocations: [],
  closes: [],
  closeLines: [],
  transfers: [],
  expenses: [],
  ...o,
});

/** A year of trading: standalone flips, an opened lot, a dud lot, an unopened
 * lot, a keeper, an undated item and an expense. */
function year2026(): TaxData {
  return data({
    items: [
      // Bought and sold in 2026, with the fee breakdown.
      item("A", {
        purchase_price: 50, purchase_date: "2026-02-01",
        sale_date: "2026-03-01", sale_payout: 80,
        sale_gross_cents: 10000, sale_fees_cents: 1500, sale_shipping_cents: 500,
      }),
      // Held since 2025.
      item("B", { purchase_price: 40, purchase_date: "2025-06-01", est_value: 50 }),
      // From lot L1 ($30 → $20 + $10). C sells, D doesn't.
      item("C", { lot_id: "L1", purchase_price: 20, purchase_date: "2026-01-10", sale_date: "2026-04-01", sale_payout: 50 }),
      item("D", { lot_id: "L1", purchase_price: 10, purchase_date: "2026-01-10", est_value: 4 }),
      // Moved to the Personal Collection, with a transfer record.
      item("E", { purchase_price: 10, purchase_date: "2026-02-01", personal_at: "2026-06-01" }),
      // No purchase date: on hand since before records start.
      item("F", { purchase_price: 5 }),
    ],
    lots: [
      lot("L1", { purchased_on: "2026-01-10", total_cost_cents: 3000, opened_on: "2026-01-15" }),
      lot("L2", { purchased_on: "2026-05-01", total_cost_cents: 2000, opened_on: "2026-05-02" }),
      lot("L3", { purchased_on: "2026-11-01", total_cost_cents: 2500, est_value_cents: 1000 }),
    ],
    allocations: [
      { lot_id: "L1", version: 1, loss_cents: 0 },
      { lot_id: "L2", version: 1, loss_cents: 2000 },
    ],
    transfers: [{ item_id: "E", name: "E", direction: "to_personal", transferred_on: "2026-06-01", basis_cents: 1000 }],
    expenses: [{ amount: 12, spent_on: "2026-07-01" }, { amount: 99, spent_on: "2025-07-01" }],
  });
}

/** What the close_year database function does: snapshot the lines and push
 * each write-down onto its item or lot. */
function applyClose(d: TaxData, year: number, markets: Record<string, number | null>): TaxData {
  const plan = planClose(inventoryAtYearEnd(d, year), markets);
  const id = `close-${year}`;
  const close: CogsClose = {
    id, tax_year: year, reopened_at: null,
    ending_cents: plan.endingCents, writedown_cents: plan.writedownCents,
  };
  const lines: CogsCloseLine[] = plan.lines.map((l) => ({
    close_id: id, kind: l.kind,
    item_id: l.kind === "item" ? l.id : null, lot_id: l.kind === "lot" ? l.id : null,
    name: l.name, basis_before_cents: l.basisCents, market_cents: l.marketCents,
    writedown_cents: l.writedownCents, basis_after_cents: l.basisAfterCents,
  }));
  const wd = new Map(plan.lines.map((l) => [`${l.kind}:${l.id}`, l.writedownCents]));
  return {
    ...d,
    items: d.items.map((i) => ({ ...i, writedown_cents: i.writedown_cents + (wd.get(`item:${i.id}`) ?? 0) })),
    closes: [...d.closes, close],
    closeLines: [...d.closeLines, ...lines],
  };
}

describe("inventoryAtYearEnd", () => {
  it("lists unsold business stock and unopened lots on Dec 31", () => {
    const rows = inventoryAtYearEnd(year2026(), 2026);
    expect(rows.map((r) => `${r.kind}:${r.id}:${r.basisCents}`)).toEqual([
      "item:B:4000",
      "item:D:1000",
      "item:F:500",
      "lot:L3:2500",
    ]);
    expect(rows.find((r) => r.id === "D")?.estimateCents).toBe(400);
  });

  it("counts something sold after year end as still on hand at year end", () => {
    const d = year2026();
    d.items.push(item("G", { purchase_price: 9, purchase_date: "2026-12-01", sale_date: "2027-01-03", sale_payout: 20 }));
    expect(inventoryAtYearEnd(d, 2026).some((r) => r.id === "G")).toBe(true);
  });

  it("locks a lot that was opened after year end", () => {
    const d = data({ lots: [lot("L", { purchased_on: "2026-12-01", total_cost_cents: 999, opened_on: "2027-01-05" })] });
    const [row] = inventoryAtYearEnd(d, 2026);
    expect(row.locked).toMatch(/Opened after year-end/);
    // …and its items aren't on hand yet, so nothing is counted twice.
    d.items.push(item("X", { lot_id: "L", purchase_price: 9.99 }));
    expect(inventoryAtYearEnd(d, 2026)).toHaveLength(1);
  });

  it("only counts grading spend that happened by year end", () => {
    const d = data({
      items: [item("G", { purchase_price: 10, purchase_date: "2026-01-01", grading_cost: 20, grading_shipping: 5, grading_submitted_at: "2027-02-01" })],
    });
    expect(inventoryAtYearEnd(d, 2026)[0].basisCents).toBe(1000);
    expect(inventoryAtYearEnd(d, 2027)[0].basisCents).toBe(3500);
  });
});

describe("buildCogsReport", () => {
  it("computes COGS as beginning + purchases − withdrawals − ending", () => {
    const r = buildCogsReport(year2026(), 2026);
    expect(r.beginningCents).toBe(4500); // B $40 + F $5
    expect(r.beginningFromClose).toBe(false);
    expect(r.purchasesItemsCents).toBe(6000); // A $50 + E $10 (lot items are covered by their lot)
    expect(r.purchasesLotsCents).toBe(7500); // L1 + L2 + L3
    expect(r.withdrawalsCents).toBe(1000); // E
    expect(r.endingCents).toBe(8000); // B + D + F + unopened L3
    expect(r.endingFromClose).toBe(false);
    // = A $50 + C $20 + the dud lot L2 $20, which is exactly what left stock.
    expect(r.cogsCents).toBe(9000);
    expect(r.lotLossesCents).toBe(2000);
    expect(r.writedownsCents).toBe(0);
  });

  it("reports gross sales, fees, shipping and profit", () => {
    const r = buildCogsReport(year2026(), 2026);
    expect(r.salesCount).toBe(2);
    expect(r.grossSalesCents).toBe(15000); // A $100 gross + C $50 (net only)
    expect(r.feesCents).toBe(1500);
    expect(r.shippingCents).toBe(500);
    expect(r.netSalesCents).toBe(13000);
    expect(r.grossProfitCents).toBe(4000);
    expect(r.expensesCents).toBe(1200); // the 2025 expense isn't this year's
    expect(r.netProfitCents).toBe(2800);
    expect(r.basisOfSoldCents).toBe(7000);
    expect(r.warnings.join(" ")).toMatch(/1 sale has only a net payout/);
    expect(r.warnings.join(" ")).toMatch(/1 item has no purchase date/);
  });

  it("folds year-end write-downs into COGS through ending inventory", () => {
    const closed = applyClose(year2026(), 2026, {
      "item:D": 400, // $10 → $4
      "item:B": 5000, // above cost — no write-up
      "lot:L3": 1000, // $25 → $10
      "item:F": null,
    });
    const r = buildCogsReport(closed, 2026);
    expect(r.endingFromClose).toBe(true);
    expect(r.endingCents).toBe(4000 + 400 + 500 + 1000);
    expect(r.writedownsCents).toBe(600 + 1500);
    expect(r.cogsCents).toBe(9000 + 2100); // the write-downs, counted once
    expect(r.writedownLines.map((l) => l.name).sort()).toEqual(["D", "L3"]);
  });

  it("carries the close into next year: beginning inventory and written-down basis", () => {
    let d = applyClose(year2026(), 2026, { "item:D": 400, "lot:L3": 1000 });
    // In 2027, D sells for $9 net and L3 is still sealed.
    d = { ...d, items: d.items.map((i) => (i.id === "D" ? { ...i, sale_date: "2027-03-01", sale_payout: 9 } : i)) };

    const candidates = inventoryAtYearEnd(d, 2027);
    expect(candidates.find((c) => c.id === "L3")?.basisCents).toBe(1000);
    expect(candidates.find((c) => c.id === "D")).toBeUndefined();

    const r = buildCogsReport(d, 2027);
    expect(r.beginningFromClose).toBe(true);
    expect(r.beginningCents).toBe(5900);
    expect(r.purchasesCents).toBe(0);
    expect(r.endingCents).toBe(4000 + 500 + 1000); // B, F, L3 at written-down cost
    expect(r.cogsCents).toBe(400); // D at its written-down basis
    const dRow = r.details.find((x) => x.item === "D")!;
    expect(dRow).toMatchObject({ originalBasisCents: 1000, writedownCents: 600, currentBasisCents: 400, gainCents: 500 });
  });

  it("ignores a close that was reopened", () => {
    const closed = applyClose(year2026(), 2026, { "item:D": 400 });
    const reopened: TaxData = {
      ...closed,
      items: closed.items.map((i) => ({ ...i, writedown_cents: 0 })),
      closes: closed.closes.map((c) => ({ ...c, reopened_at: "2027-01-10T00:00:00Z" })),
    };
    expect(buildCogsReport(reopened, 2026).cogsCents).toBe(9000);
  });

  it("nets a move back from the Personal Collection against the withdrawal", () => {
    const transfers: CogsTransfer[] = [
      { item_id: "H", name: "H", direction: "to_personal", transferred_on: "2026-03-01", basis_cents: 700 },
      { item_id: "H", name: "H", direction: "to_inventory", transferred_on: "2026-08-01", basis_cents: 700 },
    ];
    const d = data({ items: [item("H", { purchase_price: 7, purchase_date: "2026-01-01" })], transfers });
    const r = buildCogsReport(d, 2026);
    expect(r.withdrawalsCents).toBe(0);
    expect(r.endingCents).toBe(700);
    expect(r.cogsCents).toBe(0);
  });

  it("counts keepers moved before transfers were recorded as withdrawals", () => {
    const d = data({ items: [item("K", { purchase_price: 7, purchase_date: "2026-01-01", personal_at: "2026-07-01" })] });
    const r = buildCogsReport(d, 2026);
    expect(r.legacyWithdrawalsCents).toBe(700);
    expect(r.withdrawalsCents).toBe(700);
    expect(r.cogsCents).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/before transfers were recorded/);
  });

  it("counts an old-style ripped box once, through the cards pulled from it", () => {
    const d = data({
      items: [
        item("Box", { purchase_price: 40, purchase_date: "2026-01-01", opened_at: "2026-01-02" }),
        item("Pull", { purchase_price: 40, purchase_date: "2026-01-02", ripped_from_id: "Box" }),
      ],
    });
    const r = buildCogsReport(d, 2026);
    expect(r.purchasesCents).toBe(4000); // the box, not the card again
    expect(r.endingCents).toBe(4000); // the unsold card
    expect(r.cogsCents).toBe(0);
    expect(r.details.find((x) => x.item === "Pull")?.lot).toBe("Box: Box");
  });

  it("counts grading costs in the year the card was sent in", () => {
    const d = data({
      items: [item("G", { purchase_price: 10, purchase_date: "2026-01-01", grading_cost: 20, grading_shipping: 5, grading_submitted_at: "2026-03-01", sale_date: "2026-09-01", sale_payout: 100 })],
    });
    const r = buildCogsReport(d, 2026);
    expect(r.gradingCents).toBe(2500);
    expect(r.cogsCents).toBe(3500);
  });

  it("uses only the latest allocation for a lot's loss", () => {
    const allocations: CogsAllocation[] = [
      { lot_id: "L", version: 1, loss_cents: 2000 },
      { lot_id: "L", version: 2, loss_cents: 0 }, // re-allocated: a card turned out sellable
    ];
    const d = data({ lots: [lot("L", { purchased_on: "2026-01-01", total_cost_cents: 2000, opened_on: "2026-01-02" })], allocations });
    expect(buildCogsReport(d, 2026).lotLossesCents).toBe(0);
  });
});

describe("buildCogsCsv", () => {
  it("writes the summary, per-item detail and write-downs", () => {
    const closed = applyClose(year2026(), 2026, { "item:D": 400 });
    const csv = buildCogsCsv(buildCogsReport(closed, 2026));
    expect(csv).toContain("Cost of goods sold,96.00,");
    expect(csv).toContain("Write-downs (included in COGS),6.00,");
    expect(csv).toContain("L1,D,Pokémon Cards,2026-01-10,10.00,6.00,4.00,In inventory at year end");
    expect(csv).toContain("L1,C,Pokémon Cards,2026-01-10,20.00,0.00,20.00,Sold,2026-04-01,50.00,,,50.00,30.00");
    expect(csv).toContain("D,10.00,4.00,6.00,4.00");
    expect(csv).toContain("E,2026-06-01,To Personal Collection,10.00");
  });

  it("quotes cells with commas or quotes", () => {
    const d = data({ items: [item('Charizard, "1st"', { purchase_price: 1, purchase_date: "2026-01-01" })] });
    expect(buildCogsCsv(buildCogsReport(d, 2026))).toContain('"Charizard, ""1st"""');
  });
});
