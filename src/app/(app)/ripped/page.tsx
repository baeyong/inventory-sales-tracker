import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Item } from "@/lib/types";
import RippedTable from "@/components/RippedTable";
import PageStats from "@/components/PageStats";

export const metadata = { title: "For the Love of the Game · Resale Tracker" };

export default async function RippedPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("*")
    .not("opened_at", "is", null)
    .order("opened_at", { ascending: false });
  const items = (data ?? []) as Item[];

  const totalCost = items.reduce((sum, i) => sum + Number(i.purchase_price), 0);

  return (
    <div>
      <h1 className="text-xl font-semibold">🎴 For the Love of the Game</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Sealed product you&rsquo;ve ripped open — tracked at cost. Whatever you
        pulled lives in{" "}
        <Link href="/inventory" className="text-blue-600 hover:underline">
          Inventory
        </Link>{" "}
        as separate $0-cost items.
      </p>
      {items.length > 0 && (
        <PageStats
          stats={[
            { label: "Opened", value: String(items.length) },
            { label: "Cost in", value: formatMoney(totalCost) },
          ]}
        />
      )}

      {items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Nothing opened yet. In{" "}
          <Link href="/inventory" className="text-blue-600 hover:underline">
            Inventory
          </Link>
          , select a sealed item and hit <span className="font-medium">Rip open</span>.
        </div>
      ) : (
        <div className="mt-6">
          <RippedTable items={items} />
        </div>
      )}
    </div>
  );
}
