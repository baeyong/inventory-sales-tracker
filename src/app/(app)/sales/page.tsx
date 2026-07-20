import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Item } from "@/lib/types";
import SalesTable from "@/components/SalesTable";
import FilterBar from "@/components/FilterBar";

export const metadata = { title: "Sales · Resale Tracker" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const from = typeof params.from === "string" && DATE_RE.test(params.from) ? params.from : null;
  const to = typeof params.to === "string" && DATE_RE.test(params.to) ? params.to : null;
  const category = typeof params.category === "string" ? params.category : "";

  const supabase = await createClient();

  let query = supabase
    .from("items")
    .select("*")
    .not("sale_date", "is", null)
    .order("sale_date", { ascending: false });
  if (from) query = query.gte("sale_date", from);
  if (to) query = query.lte("sale_date", to);
  if (category) query = query.eq("category", category);
  const { data } = await query;
  const items = (data ?? []) as Item[];

  const { data: catRows } = await supabase
    .from("items")
    .select("category")
    .not("sale_date", "is", null);
  const categories = [
    ...new Set((catRows ?? []).map((r) => r.category as string)),
  ].sort();

  const known = items.filter((i) => i.sale_payout !== null);
  const unknownCount = items.length - known.length;
  const totalPayout = known.reduce((s, i) => s + Number(i.sale_payout), 0);
  const totalProfit = known.reduce(
    (s, i) => s + Number(i.sale_payout) - Number(i.purchase_price),
    0
  );

  return (
    <div>
      <h1 className="text-xl font-semibold">Sales</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {items.length} {items.length === 1 ? "sale" : "sales"} ·{" "}
        {formatMoney(totalPayout)} received ·{" "}
        <span
          className={
            totalProfit >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }
        >
          {formatMoney(totalProfit)} profit
        </span>
        {unknownCount > 0 && (
          <> · {unknownCount} missing a payout (open the item to add it)</>
        )}
      </p>
      <div className="mt-3">
        <FilterBar categories={categories} showDates />
      </div>
      {(() => {
        const awaitingPayment = items.filter((i) => !i.payment_received).length;
        const toShip = items.filter((i) => !i.shipped).length;
        if (awaitingPayment === 0 && toShip === 0) return null;
        return (
          <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-400">
            {awaitingPayment > 0 && (
              <>
                {awaitingPayment} awaiting payment
                {toShip > 0 && " · "}
              </>
            )}
            {toShip > 0 && <>{toShip} not shipped yet</>}
          </p>
        );
      })()}

      {items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {from || to || category ? (
            "No sales match these filters."
          ) : (
            <>
              No sales yet. Open an item in{" "}
              <Link href="/inventory" className="text-blue-600 hover:underline">
                Inventory
              </Link>{" "}
              and mark it sold.
            </>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <SalesTable items={items} />
        </div>
      )}
    </div>
  );
}
