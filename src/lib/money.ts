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
