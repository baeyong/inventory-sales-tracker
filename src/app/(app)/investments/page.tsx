import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Item } from "@/lib/types";
import InvestmentsTable from "@/components/InvestmentsTable";
import PageStats, { type Stat } from "@/components/PageStats";

export const metadata = { title: "Investments · Resale Tracker" };

export default async function InvestmentsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("*")
    .not("invested_at", "is", null)
    .order("invested_at", { ascending: false });
  const items = (data ?? []) as Item[];

  const totalCost = items.reduce((sum, i) => sum + Number(i.purchase_price), 0);
  const valued = items.filter((i) => i.est_value !== null);
  const totalValue = valued.reduce((sum, i) => sum + Number(i.est_value), 0);
  // Compared only against the cost of the valued items, so un-valued holdings
  // don't drag the figure down as if they were worth nothing.
  const potential =
    totalValue - valued.reduce((sum, i) => sum + Number(i.purchase_price), 0);

  const stats: Stat[] = [
    {
      label: items.length === 1 ? "Holding" : "Holdings",
      value: String(items.length),
    },
    { label: "Cost", value: formatMoney(totalCost) },
    ...(valued.length > 0
      ? [
          { label: "Est. value", value: formatMoney(totalValue) },
          {
            label: "Potential profit",
            value: formatMoney(potential),
            tone: potential >= 0 ? ("pos" as const) : ("neg" as const),
          },
        ]
      : []),
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold">📈 Investments</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-500">
        Long-term holds you aren&rsquo;t planning to sell soon. They keep their
        cost and estimated value but stay out of{" "}
        <Link href="/inventory" className="text-blue-600 hover:underline">
          Inventory
        </Link>
        , so they don&rsquo;t clutter what you&rsquo;re actively flipping. Move
        any of them back whenever you want to sell.
      </p>
      {items.length > 0 && <PageStats stats={stats} />}

      {items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Nothing here yet. In{" "}
          <Link href="/inventory" className="text-blue-600 hover:underline">
            Inventory
          </Link>
          , select what you&rsquo;re holding long-term and hit{" "}
          <span className="font-medium">Move to investments</span>.
        </div>
      ) : (
        <div className="mt-6">
          <InvestmentsTable items={items} />
        </div>
      )}
    </div>
  );
}
