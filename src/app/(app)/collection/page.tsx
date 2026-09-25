import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Item } from "@/lib/types";
import CollectionTable from "@/components/CollectionTable";
import PageStats, { type Stat } from "@/components/PageStats";

export const metadata = { title: "Personal Collection · Resale Tracker" };

export default async function CollectionPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("*")
    .not("personal_at", "is", null)
    .order("personal_at", { ascending: false });
  const items = (data ?? []) as Item[];

  const totalCost = items.reduce((sum, i) => sum + Number(i.purchase_price), 0);
  const valued = items.filter((i) => i.est_value !== null);
  const totalValue = valued.reduce((sum, i) => sum + Number(i.est_value), 0);

  // No profit figure here on purpose: these aren't for sale, so what they'd
  // earn is beside the point — cost and what they're worth is the useful part.
  const stats: Stat[] = [
    {
      label: items.length === 1 ? "Item" : "Items",
      value: String(items.length),
    },
    { label: "Cost", value: formatMoney(totalCost) },
    ...(valued.length > 0
      ? [{ label: "Est. value", value: formatMoney(totalValue) }]
      : []),
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold">🗃️ Personal Collection</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-500">
        Keepers you aren&rsquo;t selling at all. They stay out of{" "}
        <Link href="/inventory" className="text-blue-600 hover:underline">
          Inventory
        </Link>{" "}
        and, unlike{" "}
        <Link href="/investments" className="text-blue-600 hover:underline">
          Investments
        </Link>
        , their cost is reported separately from business stock in the Tax
        Summary. Move anything back if you change your mind.
      </p>
      {items.length > 0 && <PageStats stats={stats} />}

      {items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Nothing here yet. In{" "}
          <Link href="/inventory" className="text-blue-600 hover:underline">
            Inventory
          </Link>
          , select what you&rsquo;re keeping and hit{" "}
          <span className="font-medium">Keep (personal)</span>.
        </div>
      ) : (
        <div className="mt-6">
          <CollectionTable items={items} />
        </div>
      )}
    </div>
  );
}
