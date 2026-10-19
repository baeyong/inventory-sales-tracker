import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Item } from "@/lib/types";
import HoldingsTable from "@/components/HoldingsTable";
import PageHero, { type Stat } from "@/components/PageHero";
import { HoldingsTabs } from "@/components/SectionTabs";
import { signedMoney } from "@/lib/ui";

export const metadata = { title: "Investments · Resale Tracker" };

export default async function InvestmentsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .not("invested_at", "is", null)
    .order("invested_at", { ascending: false });
  if (error) throw new Error(error.message);
  const items = (data ?? []) as Item[];

  const totalCost = items.reduce((sum, i) => sum + Number(i.purchase_price), 0);
  const valued = items.filter((i) => i.est_value !== null);
  const totalValue = valued.reduce((sum, i) => sum + Number(i.est_value), 0);
  // Compared only against the cost of the valued items, so un-valued holdings
  // don't drag the figure down as if they were worth nothing.
  const potential =
    totalValue - valued.reduce((sum, i) => sum + Number(i.purchase_price), 0);

  const stats: Stat[] = [
    { label: "Cost", value: formatMoney(totalCost) },
    ...(valued.length > 0
      ? [
          { label: "Est. value", value: formatMoney(totalValue) },
          {
            label: "Potential",
            value: signedMoney(potential),
            tone: potential >= 0 ? ("pos" as const) : ("neg" as const),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <HoldingsTabs active="/investments" />
      <PageHero
        title="Investments"
        description="Long-term holds you aren’t planning to sell soon. They keep their cost and estimated value but stay out of Inventory, so they don’t clutter what you’re actively flipping."
        stats={items.length > 0 ? stats : undefined}
      />
      <HoldingsTable
        items={items}
        kind="investment"
        empty={
          <>
            Nothing here yet. In{" "}
            <Link href="/inventory" className="text-accent hover:underline">
              Inventory
            </Link>
            , select what you&rsquo;re holding long-term and choose{" "}
            <span className="font-medium">To investments</span>.
          </>
        }
      />
    </div>
  );
}
