import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBundleNumbers } from "@/app/(app)/actions";
import { type Item } from "@/lib/types";
import PendingLists from "@/components/PendingLists";

export const metadata = { title: "Pending · Resale Tracker" };

export default async function PendingPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("*")
    .not("sale_date", "is", null)
    .or("payment_received.eq.false,shipped.eq.false")
    .order("sale_date", { ascending: true });
  const items = (data ?? []) as Item[];
  const bundleNumbers = await getBundleNumbers();

  return (
    <div>
      <h1 className="text-xl font-semibold">Pending</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Sales still waiting on money or shipping — oldest first. Tick a box and
        it clears from the list.
      </p>

      {items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          All caught up — every sale is paid and shipped. See{" "}
          <Link href="/sales" className="text-blue-600 hover:underline">
            Sales
          </Link>{" "}
          for the full history.
        </div>
      ) : (
        <div className="mt-6">
          <PendingLists items={items} bundleNumbers={bundleNumbers} />
        </div>
      )}
    </div>
  );
}
