import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { costBasis, formatMoney, type Item } from "@/lib/types";
import { categoryHue } from "@/lib/categoryHue";
import { signedMoney } from "@/lib/ui";
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

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("items").select("*");
  if (error) throw new Error(error.message);
  const items = (data ?? []) as Item[];

  // Active stock only. Ripped product is consumed, Investments are long-term
  // holdings, and the Personal Collection isn't for sale, so none of them
  // count toward these figures.
  const unsold = items.filter(
    (i) => !i.sale_date && !i.opened_at && !i.invested_at && !i.personal_at
  );
  const sold = items.filter((i) => i.sale_date);
  // Long-term holdings: still owned and unsold, just not up for sale.
  const holdings = items.filter((i) => !i.sale_date && i.invested_at);
  const holdingCost = holdings.reduce(
    (s, i) => s + costBasis(i),
    0
  );
  const holdingValued = holdings.filter((i) => i.est_value !== null);
  const holdingValue = holdingValued.reduce(
    (s, i) => s + Number(i.est_value),
    0
  );
  // Personal collection: owned, unsold, and never for sale.
  const keepers = items.filter((i) => !i.sale_date && i.personal_at);
  const keeperCost = keepers.reduce((s, i) => s + costBasis(i), 0);
  const keeperValued = keepers.filter((i) => i.est_value !== null);
  const keeperValue = keeperValued.reduce(
    (s, i) => s + Number(i.est_value),
    0
  );
  // Profit math only counts sales whose payout is known.
  const soldKnown = sold.filter((i) => i.sale_payout !== null);

  const invested = unsold.reduce((s, i) => s + costBasis(i), 0);

  const revenue = soldKnown.reduce((s, i) => s + Number(i.sale_payout), 0);
  const profit = soldKnown.reduce(
    (s, i) => s + Number(i.sale_payout) - costBasis(i),
    0
  );

  const thisMonth = new Date().toISOString().slice(0, 7);
  const profitThisMonth = soldKnown
    .filter((i) => monthKey(i.sale_date!) === thisMonth)
    .reduce((s, i) => s + Number(i.sale_payout) - costBasis(i), 0);

  const byMonth = new Map<string, number>();
  for (const i of soldKnown) {
    const key = monthKey(i.sale_date!);
    byMonth.set(
      key,
      (byMonth.get(key) ?? 0) +
        Number(i.sale_payout) -
        costBasis(i)
    );
  }
  const chartData: MonthPoint[] = lastTwelveMonths().map(({ key, label }) => ({
    month: label,
    profit: Math.round((byMonth.get(key) ?? 0) * 100) / 100,
  }));

  const byCategory = new Map<
    string,
    { inStock: number; invested: number; soldCount: number; revenue: number; catProfit: number }
  >();
  for (const i of items) {
    // Ripped product and long-term holdings aren't active stock.
    if (!i.sale_date && (i.opened_at || i.invested_at || i.personal_at))
      continue;
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
        row.catProfit += Number(i.sale_payout) - costBasis(i);
      }
    } else {
      row.inStock++;
      row.invested += costBasis(i);
    }
    byCategory.set(i.category, row);
  }
  const categoryRows = [...byCategory.entries()].sort(
    (a, b) => b[1].catProfit - a[1].catProfit
  );

  // What needs doing: sales still waiting on money or a parcel, and stock that
  // isn't listed or valued yet.
  const awaiting = sold.filter((i) => !i.payment_received);
  const awaitingTotal = awaiting.reduce(
    (s, i) => s + (i.sale_payout === null ? 0 : Number(i.sale_payout)),
    0
  );
  const toShip = sold.filter((i) => !i.shipped).length;
  const notListed = unsold.filter((i) => !i.listed).length;
  const unvalued = unsold.filter((i) => i.est_value === null).length;
  const listedCount = unsold.length - notListed;
  const unsoldValued = unsold.filter((i) => i.est_value !== null);
  const unsoldValue = unsoldValued.reduce((s, i) => s + Number(i.est_value), 0);
  const missing = sold.length - soldKnown.length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Dashboard</h1>

      {/* Pale hero: the headline figure, white wells for the supporting ones */}
      <section className="rounded-[22px] bg-panel p-5 sm:px-[30px] sm:py-7">
        <div className="flex flex-wrap items-end gap-4 sm:gap-7">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-[0.04em] text-panel-ink">
              Realized profit
            </div>
            <div
              className={`disp tnum mt-1.5 text-[40px] font-bold leading-[1.02] sm:text-[54px] ${
                profit >= 0 ? "text-panel-strong" : "text-neg"
              }`}
            >
              {signedMoney(profit)}
            </div>
            <div className="mt-2 text-[13px] text-panel-ink">
              All time, net of cost
              {missing > 0 &&
                ` · ${missing} sale${missing === 1 ? "" : "s"} missing a payout aren’t counted`}
            </div>
          </div>
          <span className="hidden grow sm:block" />
          <dl className="flex w-full gap-2 sm:w-auto sm:gap-2.5">
            <HeroWell
              label="This month"
              value={signedMoney(profitThisMonth)}
              tone={profitThisMonth >= 0 ? "text-pos" : "text-neg"}
            />
            <HeroWell label="Received" value={formatMoney(revenue)} />
            <HeroWell label="Sales" value={String(sold.length)} />
          </dl>
        </div>
      </section>

      {/* What you own */}
      <section>
        <h2 className="cap mb-2.5">What you own</h2>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
          <OwnCard
            href="/inventory"
            name="Inventory"
            count={unsold.length}
            dot="bg-accent"
            badge="bg-soft text-on-soft"
            cost={invested}
            worth={unsoldValued.length > 0 ? unsoldValue : null}
          >
            {unsold.length > 0 && (
              <>
                <div className="mt-3.5 h-[5px] overflow-hidden rounded-[3px] bg-soft">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${(listedCount / unsold.length) * 100}%` }}
                  />
                </div>
                <div className="cap mt-[7px]">
                  {listedCount} listed · {notListed} to go
                </div>
              </>
            )}
          </OwnCard>
          <OwnCard
            href="/investments"
            name="Investments"
            count={holdings.length}
            dot="bg-hold"
            badge="bg-hold-surface text-hold"
            cost={holdingCost}
            worth={holdingValued.length > 0 ? holdingValue : null}
          >
            {holdingValued.length > 0 && (
              <PotentialLine
                value={
                  holdingValue -
                  holdingValued.reduce((s, i) => s + costBasis(i), 0)
                }
              />
            )}
          </OwnCard>
          <OwnCard
            href="/collection"
            name="Collection"
            count={keepers.length}
            dot="bg-keep"
            badge="bg-keep-surface text-keep"
            cost={keeperCost}
            worth={keeperValued.length > 0 ? keeperValue : null}
          >
            <div className="mt-4 inline-block rounded-[9px] bg-inset px-[11px] py-2 text-xs text-muted">
              Kept out of business totals
            </div>
          </OwnCard>
        </div>
      </section>

      {/* Needs attention */}
      <section className="card px-[22px] py-[18px]">
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3">
          <h2 className="text-sm font-semibold">Needs attention</h2>
          {awaiting.length + toShip + notListed + unvalued === 0 ? (
            <span className="text-[13px] text-muted">
              All caught up — nothing waiting.
            </span>
          ) : (
            <div className="flex flex-wrap gap-[9px]">
              {awaiting.length > 0 && (
                <Chip href="/pending" warn>
                  <span className="tnum">{awaiting.length}</span> awaiting payment
                  {awaitingTotal > 0 && (
                    <>
                      {" · "}
                      <span className="tnum">{formatMoney(awaitingTotal)}</span>
                    </>
                  )}
                </Chip>
              )}
              {toShip > 0 && (
                <Chip href="/pending" warn>
                  <span className="tnum">{toShip}</span> to ship
                </Chip>
              )}
              {notListed > 0 && (
                <Chip href="/inventory?listed=no">
                  <span className="tnum">{notListed}</span> not listed
                </Chip>
              )}
              {unvalued > 0 && (
                <Chip href="/inventory">
                  <span className="tnum">{unvalued}</span> unvalued
                </Chip>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Chart + categories */}
      <div className="flex flex-wrap gap-3.5">
        <section className="card min-w-0 grow-[999] basis-[560px] px-6 py-[22px]">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="disp text-[15px] font-bold">Monthly profit</h2>
            <span className="cap">Last 12 months</span>
          </div>
          <div className="mt-5">
            {sold.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">
                No sales recorded yet — profits will show up here.
              </p>
            ) : (
              <ProfitChart data={chartData} />
            )}
          </div>
        </section>

        <section className="card min-w-0 grow basis-[340px] px-6 py-[22px]">
          <h2 className="disp mb-3.5 text-[15px] font-bold">By category</h2>
          {categoryRows.length === 0 ? (
            <p className="text-sm text-muted">Nothing recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-[9px]">
              {categoryRows.map(([cat, r]) => (
                <li
                  key={cat}
                  className="flex items-center gap-3 rounded-[13px] bg-inset px-3.5 py-[11px]"
                >
                  <span
                    className="h-7 w-2 shrink-0 rounded"
                    style={{ background: categoryHue(cat) }}
                  />
                  <div className="min-w-0 grow">
                    <div className="truncate text-[13px] font-semibold">{cat}</div>
                    <div className="cap mt-px">
                      <span className="tnum">{r.soldCount}</span> sold
                      {r.inStock > 0 && (
                        <>
                          {" · "}
                          <span className="tnum">{r.inStock}</span> in stock
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className={`disp tnum text-[15px] font-bold ${
                      r.soldCount === 0
                        ? "text-muted"
                        : r.catProfit >= 0
                          ? "text-pos"
                          : "text-neg"
                    }`}
                  >
                    {r.soldCount === 0 ? "—" : signedMoney(r.catProfit)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function HeroWell({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-surface px-3 py-[11px] sm:min-w-[124px] sm:flex-none sm:rounded-[14px] sm:px-[18px] sm:py-3.5">
      <dt className="cap">{label}</dt>
      <dd className={`disp tnum mt-[3px] text-[17px] font-bold sm:text-[22px] ${tone}`}>
        {value}
      </dd>
    </div>
  );
}

function OwnCard({
  href,
  name,
  count,
  dot,
  badge,
  cost,
  worth,
  children,
}: {
  href: string;
  name: string;
  count: number;
  dot: string;
  badge: string;
  cost: number;
  worth: number | null;
  children?: React.ReactNode;
}) {
  return (
    <Link href={href} className="card block px-[22px] py-5 hover:bg-inset">
      <div className="flex items-center gap-[9px]">
        <span className={`h-[9px] w-[9px] rounded-[3px] ${dot}`} />
        <span className="text-sm font-semibold">{name}</span>
        <span className="grow" />
        <span
          className={`tnum rounded-full px-[9px] py-[3px] text-[11px] font-semibold ${badge}`}
        >
          {count}
        </span>
      </div>
      <div className="disp tnum mt-3 text-[30px] font-bold">{formatMoney(cost)}</div>
      <div className="cap mt-[3px]">
        {worth === null ? (
          "cost · not valued yet"
        ) : (
          <>
            worth{" "}
            <span className="tnum font-semibold text-ink">{formatMoney(worth)}</span>
          </>
        )}
      </div>
      {children}
    </Link>
  );
}

function PotentialLine({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <div
      className={`mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold ${
        up ? "text-pos" : "text-neg"
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d={up ? "M6 10 L6 2 M2.5 5.5 L6 2 L9.5 5.5" : "M6 2 L6 10 M2.5 6.5 L6 10 L9.5 6.5"}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
      <span className="tnum">{signedMoney(value)} potential</span>
    </div>
  );
}

function Chip({
  href,
  warn = false,
  children,
}: {
  href: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl px-[13px] py-[9px] text-xs font-semibold hover:underline ${
        warn ? "bg-warn-surface text-warn" : "bg-inset text-ink-2"
      }`}
    >
      {children}
    </Link>
  );
}
