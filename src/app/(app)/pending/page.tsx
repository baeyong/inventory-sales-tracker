import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBundleNumbers } from "@/app/(app)/actions";
import { formatMoney, type Item } from "@/lib/types";
import { emptyState } from "@/lib/ui";
import PageHero from "@/components/PageHero";
import { SalesTabs } from "@/components/SectionTabs";
import PendingLists from "@/components/PendingLists";

export const metadata = { title: "Pending · Resale Tracker" };

export default async function PendingPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .not("sale_date", "is", null)
    .or("payment_received.eq.false,shipped.eq.false")
    .order("sale_date", { ascending: true });
  if (error) throw new Error(error.message);
  const items = (data ?? []) as Item[];
  const bundleNumbers = await getBundleNumbers();

  const awaiting = items.filter((i) => !i.payment_received);
  const awaitingTotal = awaiting.reduce(
    (sum, i) => sum + (i.sale_payout === null ? 0 : Number(i.sale_payout)),
    0
  );
  const toShip = items.filter((i) => !i.shipped).length;

  return (
    <div className="flex flex-col gap-4">
      <SalesTabs active="/pending" />

      <PageHero
        title="Pending"
        description="Sales still waiting on money or shipping — oldest first. Tick a box and it clears from the list."
        stats={
          items.length > 0
            ? [
                { label: "Awaiting", value: formatMoney(awaitingTotal), tone: "warn" },
                { label: "To ship", value: String(toShip) },
              ]
            : undefined
        }
      />

      {items.length === 0 ? (
        <div className={emptyState}>
          All caught up — every sale is paid and shipped. See{" "}
          <Link href="/sales" className="text-accent hover:underline">
            Sales
          </Link>{" "}
          for the full history.
        </div>
      ) : (
        <PendingLists items={items} bundleNumbers={bundleNumbers} />
      )}
    </div>
  );
}
