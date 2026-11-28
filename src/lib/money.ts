/** Split a total (in dollars) into `n` cent-exact shares that sum back to the
 * total. Extra pennies are spread across the first items; works for negative
 * totals too (fees exceeding the sale price). */
export function splitPayout(total: number, n: number): number[] {
  const totalCents = Math.round(total * 100);
  const share = Math.trunc(totalCents / n);
  const remainder = totalCents - share * n;
  const step = remainder >= 0 ? 1 : -1;
  const cents = new Array(n).fill(share);
  for (let k = 0; k < Math.abs(remainder); k++) cents[k] += step;
  return cents.map((c) => c / 100);
}

/** Dollars (as stored in the older numeric columns) to integer cents. */
export function toCents(dollars: number | string | null | undefined): number {
  return Math.round(Number(dollars ?? 0) * 100);
}

/** "$1,234.56" from integer cents. */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** A typed dollar amount ("12.5", "$1,200") to cents; null when blank or not
 * a number. */
export function parseCents(input: string | null | undefined): number | null {
  const t = String(input ?? "").replace(/[$,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
