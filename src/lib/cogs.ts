// Inventory-on-hand and the Schedule C cost-of-goods-sold report. Pure
// functions over plain rows, all in integer cents, so the year-end close, the
// report page and the tests all agree.
//
//   COGS = beginning inventory + purchases + grading costs
//          − withdrawals to the Personal Collection − ending inventory
//
// Write-downs and losses on lots with nothing sellable are already inside that
// number (they shrink ending inventory), so the report lists them for
// information only — adding them again would count them twice.

import { toCents } from "./money";
import type {
  Expense,
  InventoryTransfer,
  Item,
  Lot,
  LotAllocation,
  YearEndClose,
  YearEndLine,
} from "./types";
import type { CloseCandidate } from "./writedown";

export type CogsItem = Pick<
  Item,
  | "id"
  | "name"
  | "category"
  | "purchase_price"
  | "purchase_date"
  | "grading_cost"
  | "grading_shipping"
  | "grading_submitted_at"
  | "sale_date"
  | "sale_payout"
  | "sale_gross_cents"
  | "sale_fees_cents"
  | "sale_shipping_cents"
  | "opened_at"
  | "ripped_from_id"
  | "personal_at"
  | "lot_id"
  | "est_value"
  | "writedown_cents"
>;
export type CogsLot = Pick<
  Lot,
  "id" | "name" | "category" | "purchased_on" | "total_cost_cents" | "est_value_cents" | "opened_on"
>;
export type CogsAllocation = Pick<LotAllocation, "lot_id" | "version" | "loss_cents">;
export type CogsClose = Pick<
  YearEndClose,
  "id" | "tax_year" | "ending_cents" | "writedown_cents" | "reopened_at"
>;
export type CogsCloseLine = Pick<
  YearEndLine,
  | "close_id"
  | "kind"
  | "item_id"
  | "lot_id"
  | "name"
  | "basis_before_cents"
  | "market_cents"
  | "writedown_cents"
  | "basis_after_cents"
>;
export type CogsTransfer = Pick<
  InventoryTransfer,
  "item_id" | "name" | "direction" | "transferred_on" | "basis_cents"
>;
export type CogsExpense = Pick<Expense, "amount" | "spent_on">;

export type TaxData = {
  items: CogsItem[];
  lots: CogsLot[];
  allocations: CogsAllocation[];
  closes: CogsClose[];
  closeLines: CogsCloseLine[];
  transfers: CogsTransfer[];
  expenses: CogsExpense[];
};

export const yearEnd = (year: number) => `${year}-12-31`;
const inYear = (d: string | null | undefined, year: number) =>
  !!d && d.startsWith(`${year}-`);

/** Indexes built once per data set. */
class Ledger {
  readonly lotsById = new Map<string, CogsLot>();
  readonly active: CogsClose[];
  private readonly wd = new Map<string, { year: number; cents: number }[]>();
  private readonly transfersByItem = new Map<string, CogsTransfer[]>();

  constructor(readonly data: TaxData) {
    for (const l of data.lots) this.lotsById.set(l.id, l);
    this.active = data.closes.filter((c) => !c.reopened_at);
    const yearOf = new Map(this.active.map((c) => [c.id, c.tax_year]));
    for (const line of data.closeLines) {
      const year = yearOf.get(line.close_id);
      const id = line.kind === "item" ? line.item_id : line.lot_id;
      if (year === undefined || !id || !line.writedown_cents) continue;
      const k = `${line.kind}:${id}`;
      this.wd.set(k, [...(this.wd.get(k) ?? []), { year, cents: Number(line.writedown_cents) }]);
    }
    const sorted = [...data.transfers].sort((a, b) =>
      a.transferred_on.localeCompare(b.transferred_on)
    );
    for (const t of sorted) {
      if (!t.item_id) continue;
      this.transfersByItem.set(t.item_id, [...(this.transfersByItem.get(t.item_id) ?? []), t]);
    }
  }

  close(year: number): CogsClose | null {
    return this.active.find((c) => c.tax_year === year) ?? null;
  }

  /** Write-downs from closes of years before `year`. */
  writedownsBefore(kind: "item" | "lot", id: string, year: number): number {
    return (this.wd.get(`${kind}:${id}`) ?? [])
      .filter((w) => w.year < year)
      .reduce((s, w) => s + w.cents, 0);
  }

  hasTransfers(itemId: string): boolean {
    return (this.transfersByItem.get(itemId)?.length ?? 0) > 0;
  }

  /** In the Personal Collection on `date`? Transfer records win; items moved
   * before records existed fall back to personal_at. */
  personalOn(item: CogsItem, date: string): boolean {
    const ts = this.transfersByItem.get(item.id);
    if (!ts || ts.length === 0) return !!item.personal_at && item.personal_at <= date;
    const before = ts.filter((t) => t.transferred_on <= date);
    if (before.length > 0) return before[before.length - 1].direction === "to_personal";
    // Its first record moved it back to inventory, so it was a keeper before.
    return ts[0].direction === "to_inventory";
  }

  /** Grading spend that had happened by `date`. */
  gradingBy(item: CogsItem, date: string): number {
    if (!item.grading_submitted_at || item.grading_submitted_at > date) return 0;
    return toCents(item.grading_cost) + toCents(item.grading_shipping);
  }

  /** Basis at the end of `year`, before that year's own close. */
  itemBasisAt(item: CogsItem, year: number): number {
    return (
      toCents(item.purchase_price) +
      this.gradingBy(item, yearEnd(year)) -
      this.writedownsBefore("item", item.id, year)
    );
  }

  lotBasisAt(lot: CogsLot, year: number): number {
    return Number(lot.total_cost_cents) - this.writedownsBefore("lot", lot.id, year);
  }

  /** Business inventory on `date`: not yet sold, ripped or kept. Investments
   * count — they're stock held for sale, just not soon. Items with no
   * purchase date count as on hand from the start. */
  itemOnHand(item: CogsItem, date: string): boolean {
    if (item.lot_id) {
      const lot = this.lotsById.get(item.lot_id);
      if (!lot?.opened_on || lot.opened_on > date) return false;
    } else if (item.purchase_date && item.purchase_date > date) {
      return false;
    }
    if (item.sale_date && item.sale_date <= date) return false;
    if (item.opened_at && item.opened_at <= date) return false;
    return !this.personalOn(item, date);
  }

  lotOnHand(lot: CogsLot, date: string): boolean {
    return lot.purchased_on <= date && (!lot.opened_on || lot.opened_on > date);
  }
}

/** Everything on hand at the end of `year`, at its basis before that year's
 * write-downs — the rows the year-end close lists. */
export function inventoryAtYearEnd(data: TaxData, year: number): CloseCandidate[] {
  const L = new Ledger(data);
  return snapshot(L, year);
}

function snapshot(L: Ledger, year: number): CloseCandidate[] {
  const date = yearEnd(year);
  const out: CloseCandidate[] = [];
  for (const lot of L.data.lots) {
    if (!L.lotOnHand(lot, date)) continue;
    out.push({
      kind: "lot",
      id: lot.id,
      name: lot.name,
      category: lot.category,
      basisCents: L.lotBasisAt(lot, year),
      estimateCents: lot.est_value_cents === null ? null : Number(lot.est_value_cents),
      locked: lot.opened_on
        ? "Opened after year-end — its cost is already split across its items, so it can't be written down."
        : null,
    });
  }
  for (const item of L.data.items) {
    if (!L.itemOnHand(item, date)) continue;
    out.push({
      kind: "item",
      id: item.id,
      name: item.name,
      category: item.category,
      basisCents: L.itemBasisAt(item, year),
      estimateCents: item.est_value === null ? null : toCents(item.est_value),
      locked: null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type CogsDetailRow = {
  lot: string;
  item: string;
  category: string;
  purchaseDate: string;
  originalBasisCents: number;
  writedownCents: number;
  currentBasisCents: number;
  status: string;
  saleDate: string;
  grossCents: number | null;
  feesCents: number | null;
  shippingCents: number | null;
  netCents: number | null;
  gainCents: number | null;
};

export type CogsLotRow = {
  name: string;
  purchasedOn: string;
  costCents: number;
  openedOn: string;
  status: string;
  lossCents: number;
};

export type CogsReport = {
  year: number;
  beginningCents: number;
  beginningFromClose: boolean;
  purchasesItemsCents: number;
  purchasesLotsCents: number;
  purchasesCents: number;
  gradingCents: number;
  withdrawalsCents: number;
  /** Part of withdrawals: items moved before transfers were recorded. */
  legacyWithdrawalsCents: number;
  endingCents: number;
  endingFromClose: boolean;
  cogsCents: number;
  writedownsCents: number;
  lotLossesCents: number;
  salesCount: number;
  grossSalesCents: number;
  feesCents: number;
  shippingCents: number;
  netSalesCents: number;
  /** Sum of the cost basis of what sold — a cross-check, not the COGS. */
  basisOfSoldCents: number;
  grossProfitCents: number;
  expensesCents: number;
  netProfitCents: number;
  warnings: string[];
  lots: CogsLotRow[];
  details: CogsDetailRow[];
  writedownLines: CogsCloseLine[];
  transfers: CogsTransfer[];
};

export function buildCogsReport(data: TaxData, year: number): CogsReport {
  const L = new Ledger(data);
  const end = yearEnd(year);
  const warnings: string[] = [];

  // Beginning = last year's closed ending inventory; otherwise worked out at
  // cost from the data.
  const prior = L.close(year - 1);
  const beginningSnap = prior ? null : snapshot(L, year - 1);
  const beginningCents = prior
    ? Number(prior.ending_cents)
    : beginningSnap!.reduce((s, c) => s + c.basisCents, 0);
  if (!prior) {
    warnings.push(
      `${year - 1} hasn't been closed, so beginning inventory is worked out at cost from your records, with no ${year - 1} write-downs.`
    );
  }

  // Purchases: standalone items and lots bought this year. Items from a lot
  // are covered by the lot; cards from an old-style ripped box are covered by
  // the box they came out of.
  let purchasesItemsCents = 0;
  let gradingCents = 0;
  for (const it of data.items) {
    if (!it.lot_id && !it.ripped_from_id && inYear(it.purchase_date, year)) {
      purchasesItemsCents += toCents(it.purchase_price);
    }
    if (inYear(it.grading_submitted_at, year)) {
      gradingCents += toCents(it.grading_cost) + toCents(it.grading_shipping);
    }
  }
  const purchasesLotsCents = data.lots
    .filter((l) => inYear(l.purchased_on, year))
    .reduce((s, l) => s + Number(l.total_cost_cents), 0);

  // Withdrawals for personal use (Schedule C line 36). A move back into
  // inventory reverses one.
  let withdrawalsCents = 0;
  const yearTransfers = data.transfers.filter((t) => inYear(t.transferred_on, year));
  for (const t of yearTransfers) {
    withdrawalsCents += t.direction === "to_personal" ? Number(t.basis_cents) : -Number(t.basis_cents);
  }
  let legacyWithdrawalsCents = 0;
  let legacyCount = 0;
  for (const it of data.items) {
    if (inYear(it.personal_at, year) && !L.hasTransfers(it.id)) {
      legacyWithdrawalsCents += L.itemBasisAt(it, year);
      legacyCount++;
    }
  }
  withdrawalsCents += legacyWithdrawalsCents;
  if (legacyCount > 0) {
    warnings.push(
      `${legacyCount} item${legacyCount === 1 ? " was" : "s were"} moved to the Personal Collection before transfers were recorded; counted as withdrawals at their current cost.`
    );
  }

  const close = L.close(year);
  const endingSnap = snapshot(L, year);
  const endingCents = close
    ? Number(close.ending_cents)
    : endingSnap.reduce((s, c) => s + c.basisCents, 0);
  if (!close) {
    warnings.push(
      `${year} hasn't been closed yet, so ending inventory is at cost with no write-downs. Run the year-end close to finalize it.`
    );
  }

  const purchasesCents = purchasesItemsCents + purchasesLotsCents;
  const cogsCents =
    beginningCents + purchasesCents + gradingCents - withdrawalsCents - endingCents;

  // Lots opened this year with nothing sellable: their latest allocation's loss.
  const latest = new Map<string, CogsAllocation>();
  for (const a of data.allocations) {
    const cur = latest.get(a.lot_id);
    if (!cur || a.version > cur.version) latest.set(a.lot_id, a);
  }
  const lotRows: CogsLotRow[] = [];
  let lotLossesCents = 0;
  for (const lot of data.lots) {
    const touched =
      inYear(lot.purchased_on, year) ||
      inYear(lot.opened_on, year) ||
      L.lotOnHand(lot, end) ||
      L.lotOnHand(lot, `${year - 1}-12-31`);
    if (!touched) continue;
    const loss = inYear(lot.opened_on, year) ? Number(latest.get(lot.id)?.loss_cents ?? 0) : 0;
    lotLossesCents += loss;
    lotRows.push({
      name: lot.name,
      purchasedOn: lot.purchased_on,
      costCents: Number(lot.total_cost_cents),
      openedOn: lot.opened_on ?? "",
      status: L.lotOnHand(lot, end) ? "Unopened at year end" : "Opened",
      lossCents: loss,
    });
  }

  // Sales.
  let salesCount = 0;
  let grossSalesCents = 0;
  let feesCents = 0;
  let shippingCents = 0;
  let netSalesCents = 0;
  let basisOfSoldCents = 0;
  let noBreakdown = 0;
  let noPayout = 0;
  for (const it of data.items) {
    if (!inYear(it.sale_date, year)) continue;
    if (it.sale_payout === null) {
      noPayout++;
      continue;
    }
    const net = toCents(it.sale_payout);
    salesCount++;
    netSalesCents += net;
    if (it.sale_gross_cents === null) {
      noBreakdown++;
      grossSalesCents += net;
    } else {
      grossSalesCents += Number(it.sale_gross_cents);
      feesCents += Number(it.sale_fees_cents ?? 0);
      shippingCents += Number(it.sale_shipping_cents ?? 0);
    }
    basisOfSoldCents += currentBasis(it);
  }
  if (noBreakdown > 0) {
    warnings.push(
      `${noBreakdown} sale${noBreakdown === 1 ? " has" : "s have"} only a net payout, so ${noBreakdown === 1 ? "it's" : "they're"} counted in gross sales at that net figure with no fees.`
    );
  }
  if (noPayout > 0) {
    warnings.push(
      `${noPayout} sale${noPayout === 1 ? " is" : "s are"} missing a payout and left out of sales.`
    );
  }
  const undated = data.items.filter((i) => !i.purchase_date && !i.lot_id).length;
  if (undated > 0) {
    warnings.push(
      `${undated} item${undated === 1 ? " has" : "s have"} no purchase date and ${undated === 1 ? "is" : "are"} treated as on hand since before your records start.`
    );
  }

  const expensesCents = data.expenses
    .filter((e) => inYear(e.spent_on, year))
    .reduce((s, e) => s + toCents(e.amount), 0);

  const grossProfitCents = netSalesCents - cogsCents;

  // Per-item detail: anything held, bought, sold or moved this year.
  const begin = `${year - 1}-12-31`;
  const yearTransferIds = new Set(yearTransfers.map((t) => t.item_id));
  const boxNames = new Map(data.items.map((i) => [i.id, i.name]));
  const details: CogsDetailRow[] = [];
  for (const it of data.items) {
    const sold = inYear(it.sale_date, year);
    const relevant =
      sold ||
      L.itemOnHand(it, begin) ||
      L.itemOnHand(it, end) ||
      (inYear(it.purchase_date, year) && !it.lot_id) ||
      yearTransferIds.has(it.id) ||
      inYear(it.personal_at, year);
    if (!relevant) continue;
    const net = sold && it.sale_payout !== null ? toCents(it.sale_payout) : null;
    const basis = currentBasis(it);
    details.push({
      lot: it.lot_id
        ? (L.lotsById.get(it.lot_id)?.name ?? "")
        : it.ripped_from_id
          ? `Box: ${boxNames.get(it.ripped_from_id) ?? ""}`
          : "",
      item: it.name,
      category: it.category,
      purchaseDate: it.purchase_date ?? "",
      originalBasisCents: basis + Number(it.writedown_cents ?? 0),
      writedownCents: Number(it.writedown_cents ?? 0),
      currentBasisCents: basis,
      status: sold
        ? "Sold"
        : L.itemOnHand(it, end)
          ? "In inventory at year end"
          : L.personalOn(it, end)
            ? "Personal Collection"
            : it.sale_date && it.sale_date <= end
              ? "Sold earlier"
              : it.opened_at
                ? "Opened"
                : "Not on hand",
      saleDate: sold ? it.sale_date! : "",
      grossCents: sold ? (it.sale_gross_cents ?? net) : null,
      feesCents: sold ? (it.sale_fees_cents ?? null) : null,
      shippingCents: sold ? (it.sale_shipping_cents ?? null) : null,
      netCents: net,
      gainCents: net === null ? null : net - basis,
    });
  }
  details.sort((a, b) => a.lot.localeCompare(b.lot) || a.item.localeCompare(b.item));

  return {
    year,
    beginningCents,
    beginningFromClose: !!prior,
    purchasesItemsCents,
    purchasesLotsCents,
    purchasesCents,
    gradingCents,
    withdrawalsCents,
    legacyWithdrawalsCents,
    endingCents,
    endingFromClose: !!close,
    cogsCents,
    writedownsCents: close ? Number(close.writedown_cents) : 0,
    lotLossesCents,
    salesCount,
    grossSalesCents,
    feesCents,
    shippingCents,
    netSalesCents,
    basisOfSoldCents,
    grossProfitCents,
    expensesCents,
    netProfitCents: grossProfitCents - expensesCents,
    warnings,
    lots: lotRows,
    details,
    writedownLines: close
      ? data.closeLines.filter((l) => l.close_id === close.id && l.writedown_cents > 0)
      : [],
    transfers: yearTransfers,
  };
}

/** Basis today, with every grading cost and write-down applied — what a sale's
 * gain or loss is measured against. */
function currentBasis(it: CogsItem): number {
  return (
    toCents(it.purchase_price) +
    toCents(it.grading_cost) +
    toCents(it.grading_shipping) -
    Number(it.writedown_cents ?? 0)
  );
}

// ---------------------------------------------------------------------------
// CSV

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const row = (cells: unknown[]) => cells.map(cell).join(",");
const usd = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));

export function buildCogsCsv(r: CogsReport): string {
  const out: string[] = [];
  out.push(row([`Cost of goods sold - ${r.year}`]));
  out.push("");
  out.push(row(["SUMMARY", "Amount", "Note"]));
  out.push(row(["Beginning inventory", usd(r.beginningCents), r.beginningFromClose ? `From the ${r.year - 1} close` : "Worked out at cost - prior year not closed"]));
  out.push(row(["Purchases - items", usd(r.purchasesItemsCents), ""]));
  out.push(row(["Purchases - lots", usd(r.purchasesLotsCents), ""]));
  out.push(row(["Purchases (total)", usd(r.purchasesCents), ""]));
  out.push(row(["Grading costs", usd(r.gradingCents), "Fees and shipping for cards sent in this year"]));
  out.push(row(["Less: withdrawals to Personal Collection", usd(r.withdrawalsCents), r.legacyWithdrawalsCents ? `Includes ${usd(r.legacyWithdrawalsCents)} moved before transfers were recorded` : ""]));
  out.push(row(["Ending inventory", usd(r.endingCents), r.endingFromClose ? "From the year-end close (after write-downs)" : "At cost - year not closed"]));
  out.push(row(["Cost of goods sold", usd(r.cogsCents), "Beginning + purchases + grading - withdrawals - ending"]));
  out.push(row(["Write-downs (included in COGS)", usd(r.writedownsCents), "Lower of cost or market at year end"]));
  out.push(row(["Lots with nothing sellable (included in COGS)", usd(r.lotLossesCents), "Whole lot cost lost on its open date"]));
  out.push(row(["Sales count", r.salesCount, ""]));
  out.push(row(["Gross sales", usd(r.grossSalesCents), ""]));
  out.push(row(["Fees", usd(r.feesCents), ""]));
  out.push(row(["Shipping", usd(r.shippingCents), ""]));
  out.push(row(["Net sales", usd(r.netSalesCents), "Gross - fees - shipping"]));
  out.push(row(["Gross profit", usd(r.grossProfitCents), "Net sales - COGS"]));
  out.push(row(["Expenses", usd(r.expensesCents), ""]));
  out.push(row(["Net profit", usd(r.netProfitCents), "Gross profit - expenses"]));
  out.push(row(["Cost basis of items sold (cross-check)", usd(r.basisOfSoldCents), "Differs from COGS by write-downs, lot losses and inventory changes"]));
  if (r.warnings.length) {
    out.push("");
    out.push(row(["NOTES"]));
    for (const w of r.warnings) out.push(row([w]));
  }

  out.push("");
  out.push(row(["LOTS", "Purchased", "Cost", "Opened", "Status", "Loss (nothing sellable)"]));
  for (const l of r.lots) {
    out.push(row([l.name, l.purchasedOn, usd(l.costCents), l.openedOn, l.status, usd(l.lossCents)]));
  }

  out.push("");
  out.push(row(["ITEMS", "Item", "Category", "Purchased", "Original basis", "Write-downs", "Current basis", "Status", "Sale date", "Gross", "Fees", "Shipping", "Net payout", "Gain/loss"]));
  for (const d of r.details) {
    out.push(row([d.lot, d.item, d.category, d.purchaseDate, usd(d.originalBasisCents), usd(d.writedownCents), usd(d.currentBasisCents), d.status, d.saleDate, usd(d.grossCents), usd(d.feesCents), usd(d.shippingCents), usd(d.netCents), usd(d.gainCents)]));
  }

  out.push("");
  out.push(row(["WRITE-DOWNS", "Basis before", "Market", "Write-down", "Basis after"]));
  for (const l of r.writedownLines) {
    out.push(row([l.name, usd(l.basis_before_cents), usd(l.market_cents), usd(l.writedown_cents), usd(l.basis_after_cents)]));
  }

  out.push("");
  out.push(row(["TRANSFERS", "Date", "Direction", "Basis"]));
  for (const t of r.transfers) {
    out.push(row([t.name, t.transferred_on, t.direction === "to_personal" ? "To Personal Collection" : "Back to inventory", usd(t.basis_cents)]));
  }

  return out.join("\n");
}
