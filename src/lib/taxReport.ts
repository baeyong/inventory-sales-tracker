// Builds an accountant-friendly Tax Summary CSV from the raw items + expenses
// dumps. Kept pure (plain records in, string out) so it's easy to verify.

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);
const money = (n: number): string => n.toFixed(2);
const yearOf = (v: unknown): string => {
  const s = str(v);
  return /^\d{4}-/.test(s) ? s.slice(0, 4) : "Undated";
};

function csvCell(v: unknown): string {
  const s = str(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const line = (cells: unknown[]): string => cells.map(csvCell).join(",");

type Status = "In inventory" | "Sold" | "Opened" | "Expense";
function itemStatus(it: Row): Status {
  if (it.sale_date) return "Sold";
  if (it.opened_at) return "Opened";
  return "In inventory";
}

type YearAgg = {
  proceeds: number;
  costOfSold: number;
  profit: number;
  ripped: number;
  expenses: number;
};
function emptyYear(): YearAgg {
  return { proceeds: 0, costOfSold: 0, profit: 0, ripped: 0, expenses: 0 };
}

export function buildTaxCsv(items: Row[], expenses: Row[]): string {
  const byYear = new Map<string, YearAgg>();
  const yr = (y: string) => {
    const a = byYear.get(y) ?? emptyYear();
    byYear.set(y, a);
    return a;
  };

  // All-time totals.
  let proceeds = 0;
  let costOfSold = 0;
  let profit = 0;
  let rippedCost = 0;
  let inventoryCount = 0;
  let inventoryCost = 0;
  let soldMissingPayout = 0;

  for (const it of items) {
    const status = itemStatus(it);
    const cost = num(it.purchase_price) ?? 0;
    if (status === "Sold") {
      const payout = num(it.sale_payout);
      if (payout === null) {
        soldMissingPayout++;
        continue; // no payout → can't count toward profit
      }
      const y = yearOf(it.sale_date);
      const ya = yr(y);
      proceeds += payout;
      costOfSold += cost;
      profit += payout - cost;
      ya.proceeds += payout;
      ya.costOfSold += cost;
      ya.profit += payout - cost;
    } else if (status === "Opened") {
      rippedCost += cost;
      yr(yearOf(it.opened_at)).ripped += cost;
    } else {
      inventoryCount++;
      inventoryCost += cost;
    }
  }

  let expensesTotal = 0;
  for (const e of expenses) {
    const amt = num(e.amount) ?? 0;
    expensesTotal += amt;
    yr(yearOf(e.spent_on)).expenses += amt;
  }

  const net = profit - rippedCost - expensesTotal;

  const out: string[] = [];
  const stamp = new Date().toISOString().slice(0, 10);
  out.push(line(["Tax Summary", stamp]));
  out.push("");

  out.push("ALL TIME");
  out.push(line(["Sales proceeds", money(proceeds)]));
  out.push(line(["Cost of items sold", money(costOfSold)]));
  out.push(line(["Profit", money(profit)]));
  out.push(line(["Ripped product cost", money(rippedCost)]));
  out.push(line(["Expenses", money(expensesTotal)]));
  out.push(line(["Net (profit − ripped − expenses)", money(net)]));
  out.push(line(["Inventory items on hand", String(inventoryCount)]));
  out.push(line(["Inventory cost on hand", money(inventoryCost)]));
  if (soldMissingPayout > 0) {
    out.push(line(["Sold missing a payout (excluded)", String(soldMissingPayout)]));
  }
  out.push("");

  out.push("BY YEAR");
  out.push(
    line([
      "Year",
      "Sales proceeds",
      "Cost of items sold",
      "Profit",
      "Ripped cost",
      "Expenses",
      "Net",
    ])
  );
  const years = [...byYear.keys()].sort();
  for (const y of years) {
    const a = byYear.get(y)!;
    const yNet = a.profit - a.ripped - a.expenses;
    out.push(
      line([
        y,
        money(a.proceeds),
        money(a.costOfSold),
        money(a.profit),
        money(a.ripped),
        money(a.expenses),
        money(yNet),
      ])
    );
  }
  out.push("");

  out.push("LINE ITEMS");
  out.push(
    line([
      "Status",
      "Item",
      "Category",
      "Acquired",
      "Cost",
      "Sold/Opened",
      "Proceeds",
      "Profit",
      "Source",
      "Notes",
    ])
  );

  type Line = { status: Status; date: string; cells: unknown[] };
  const lines: Line[] = [];

  for (const it of items) {
    const status = itemStatus(it);
    const cost = num(it.purchase_price) ?? 0;
    const payout = num(it.sale_payout);
    const soldOpened =
      status === "Sold"
        ? str(it.sale_date)
        : status === "Opened"
          ? str(it.opened_at)
          : "";
    lines.push({
      status,
      date: str(it.purchase_date),
      cells: [
        status,
        str(it.name),
        str(it.category),
        str(it.purchase_date),
        money(cost),
        soldOpened,
        status === "Sold" && payout !== null ? money(payout) : "",
        status === "Sold" && payout !== null ? money(payout - cost) : "",
        str(it.purchase_platform),
        str(it.description),
      ],
    });
  }

  for (const e of expenses) {
    lines.push({
      status: "Expense",
      date: str(e.spent_on),
      cells: [
        "Expense",
        str(e.name),
        "",
        str(e.spent_on),
        money(num(e.amount) ?? 0),
        "",
        "",
        "",
        str(e.source),
        str(e.notes),
      ],
    });
  }

  // Group by status (Sold, Opened, Expense, In inventory), newest first within.
  const order: Record<Status, number> = {
    Sold: 0,
    Opened: 1,
    Expense: 2,
    "In inventory": 3,
  };
  lines.sort((a, b) =>
    order[a.status] !== order[b.status]
      ? order[a.status] - order[b.status]
      : a.date < b.date
        ? 1
        : a.date > b.date
          ? -1
          : 0
  );
  for (const l of lines) out.push(line(l.cells));

  // BOM so Excel reads UTF-8; CRLF line endings.
  return "﻿" + out.join("\r\n");
}
