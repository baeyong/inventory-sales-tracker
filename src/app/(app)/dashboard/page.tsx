import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Item } from "@/lib/types";
import ProfitChart, { type MonthPoint } from "@/components/ProfitChart";

export const metadata = { title: "Dashboard · Resale Tracker" };

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function lastTwelveMonths(): { key: string; label: string }[] {
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", {
      month: "short",
      ...(d.getMonth() === 0 || i === 11 ? { year: "2-digit" } : {}),
    });
    months.push({ key, label });
  }
  return months;
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          tone === "pos"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "neg"
              ? "text-red-600 dark:text-red-400"
              : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("items").select("*");
  const items = (data ?? []) as Item[];

  // Opened ("ripped") product is neither in stock nor sold — it's consumed, so
  // it stays out of both the inventory and sales figures.
  const unsold = items.filter((i) => !i.sale_date && !i.opened_at);
  const sold = items.filter((i) => i.sale_date);
  // Profit math only counts sales whose payout is known.
  const soldKnown = sold.filter((i) => i.sale_payout !== null);

  const invested = unsold.reduce((s, i) => s + Number(i.purchase_price), 0);
  const revenue = soldKnown.reduce((s, i) => s + Number(i.sale_payout), 0);
  const profit = soldKnown.reduce(
    (s, i) => s + Number(i.sale_payout) - Number(i.purchase_price),
    0
  );

  const thisMonth = new Date().toISOString().slice(0, 7);
  const profitThisMonth = soldKnown
    .filter((i) => monthKey(i.sale_date!) === thisMonth)
    .reduce((s, i) => s + Number(i.sale_payout) - Number(i.purchase_price), 0);

  const byMonth = new Map<string, number>();
  for (const i of soldKnown) {
    const key = monthKey(i.sale_date!);
    byMonth.set(
      key,
      (byMonth.get(key) ?? 0) +
        Number(i.sale_payout) -
        Number(i.purchase_price)
    );
  }
  const chartData: MonthPoint[] = lastTwelveMonths().map(({ key, label }) => ({
    month: label,
    profit: Math.round((byMonth.get(key) ?? 0) * 100) / 100,
  }));

  const recentSales = [...sold]
    .sort((a, b) => (a.sale_date! < b.sale_date! ? 1 : -1))
    .slice(0, 5);

  const byCategory = new Map<
    string,
    { inStock: number; invested: number; soldCount: number; revenue: number; catProfit: number }
  >();
  for (const i of items) {
    if (i.opened_at && !i.sale_date) continue; // ripped product isn't in stock
    const row = byCategory.get(i.category) ?? {
      inStock: 0,
      invested: 0,
      soldCount: 0,
      revenue: 0,
      catProfit: 0,
    };
    if (i.sale_date) {
      row.soldCount++;
      if (i.sale_payout !== null) {
        row.revenue += Number(i.sale_payout);
        row.catProfit += Number(i.sale_payout) - Number(i.purchase_price);
      }
    } else {
      row.inStock++;
      row.invested += Number(i.purchase_price);
    }
    byCategory.set(i.category, row);
  }
  const categoryRows = [...byCategory.entries()].sort(
    (a, b) => b[1].catProfit - a[1].catProfit
  );

  return (
    <div>
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="In inventory"
          value={String(unsold.length)}
          sub={`${formatMoney(invested)} invested`}
        />
        <StatTile
          label="Total sales"
          value={String(sold.length)}
          sub={`${formatMoney(revenue)} received`}
        />
        <StatTile
          label="Realized profit"
          value={formatMoney(profit)}
          tone={profit >= 0 ? "pos" : "neg"}
          sub={
            sold.length > soldKnown.length
              ? `${sold.length - soldKnown.length} sale${sold.length - soldKnown.length === 1 ? "" : "s"} missing a payout not counted`
              : "All time, net of cost"
          }
        />
        <StatTile
          label="This month"
          value={formatMoney(profitThisMonth)}
          tone={profitThisMonth >= 0 ? "pos" : "neg"}
          sub="Profit on items sold this month"
        />
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-semibold">Monthly profit</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Net profit on items sold each month, last 12 months
        </p>
        {sold.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No sales recorded yet — profits will show up here.
          </p>
        ) : (
          <ProfitChart data={chartData} />
        )}
      </div>

      {categoryRows.length > 0 && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="font-semibold">By category</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4 text-right">In stock</th>
                  <th className="py-2 pr-4 text-right">Invested</th>
                  <th className="py-2 pr-4 text-right">Sold</th>
                  <th className="py-2 pr-4 text-right">Revenue</th>
                  <th className="py-2 text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {categoryRows.map(([cat, r]) => (
                  <tr key={cat}>
                    <td className="py-2 pr-4 font-medium">{cat}</td>
                    <td className="py-2 pr-4 text-right">{r.inStock}</td>
                    <td className="py-2 pr-4 text-right">
                      {formatMoney(r.invested)}
                    </td>
                    <td className="py-2 pr-4 text-right">{r.soldCount}</td>
                    <td className="py-2 pr-4 text-right">
                      {formatMoney(r.revenue)}
                    </td>
                    <td
                      className={`py-2 text-right font-medium ${
                        r.catProfit >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {formatMoney(r.catProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recentSales.length > 0 && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent sales</h2>
            <Link href="/sales" className="text-sm text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {recentSales.map((i) => {
              const p =
                i.sale_payout === null
                  ? null
                  : Number(i.sale_payout) - Number(i.purchase_price);
              return (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <span className="min-w-0 truncate">{i.name}</span>
                  <span className="shrink-0 text-zinc-500">
                    {i.sale_platform ?? "—"}
                  </span>
                  <span
                    className={`shrink-0 font-medium ${
                      p === null
                        ? "text-zinc-400"
                        : p >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {p === null ? "—" : formatMoney(p)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

    </div>
  );
}
