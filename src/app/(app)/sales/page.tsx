import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBundleNumbers } from "@/app/(app)/actions";
import { formatMoney, type Item } from "@/lib/types";
import SalesTable from "@/components/SalesTable";
import FilterBar from "@/components/FilterBar";
import PageHero from "@/components/PageHero";
import { SalesTabs } from "@/components/SectionTabs";
import { signedMoney } from "@/lib/ui";

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
  const bundleNumbers = await getBundleNumbers();

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

  const awaitingPayment = items.filter((i) => !i.payment_received).length;
  const toShip = items.filter((i) => !i.shipped).length;

  return (
    <div className="flex flex-col gap-4">
      <SalesTabs active="/sales" />

      <PageHero
        title="Sales"
        description="Items sold together are grouped — edit, mark paid or ship a bundle as one."
        stats={[
          { label: "Received", value: formatMoney(totalPayout) },
          {
            label: "Profit",
            value: signedMoney(totalProfit),
            tone: totalProfit >= 0 ? "pos" : "neg",
          },
        ]}
      >
        {(unknownCount > 0 || awaitingPayment > 0 || toShip > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-2 text-xs font-semibold">
            {awaitingPayment > 0 && (
              <Link
                href="/pending"
                className="rounded-xl bg-warn-surface px-3 py-2 text-warn hover:underline"
              >
                {awaitingPayment} awaiting payment
              </Link>
            )}
            {toShip > 0 && (
              <Link
                href="/pending"
                className="rounded-xl bg-warn-surface px-3 py-2 text-warn hover:underline"
              >
                {toShip} to ship
              </Link>
            )}
            {unknownCount > 0 && (
              <span className="rounded-xl bg-surface px-3 py-2 text-ink-2">
                {unknownCount} missing a payout — open the item to add it
              </span>
            )}
          </div>
        )}
      </PageHero>

      <SalesTable
        items={items}
        bundleNumbers={bundleNumbers}
        toolbar={<FilterBar categories={categories} showDates />}
        empty={
          from || to || category ? (
            "No sales match these filters."
          ) : (
            <>
              No sales yet. Open an item in{" "}
              <Link href="/inventory" className="text-accent hover:underline">
                Inventory
              </Link>{" "}
              and mark it sold.
            </>
          )
        }
      />
    </div>
  );
}
