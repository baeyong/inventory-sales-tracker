type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Read every row of a query, a page at a time. Supabase caps one response
 * at 1,000 rows by default, so a plain select("*") quietly stops there — fine
 * for a screen, wrong for tax totals. `page(from, to)` must apply a stable
 * order and `.range(from, to)`. */
export async function fetchAll<T>(
  page: (from: number, to: number) => Page<T>,
  size = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}
