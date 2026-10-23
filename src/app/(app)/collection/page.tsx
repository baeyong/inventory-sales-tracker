import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { costBasis, formatMoney, type Item } from "@/lib/types";
import HoldingsTable from "@/components/HoldingsTable";
import PageHero, { type Stat } from "@/components/PageHero";
import { HoldingsTabs } from "@/components/SectionTabs";

export const metadata = { title: "Personal Collection · Resale Tracker" };

export default async function CollectionPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("*")
    .not("personal_at", "is", null)
    .order("personal_at", { ascending: false });
  const items = (data ?? []) as Item[];

  const totalCost = items.reduce((sum, i) => sum + costBasis(i), 0);
  const valued = items.filter((i) => i.est_value !== null);
  const totalValue = valued.reduce((sum, i) => sum + Number(i.est_value), 0);

  // No profit figure here on purpose: these aren't for sale, so what they'd
  // earn is beside the point — cost and what they're worth is the useful part.
  const stats: Stat[] = [
    { label: "Cost", value: formatMoney(totalCost) },
    ...(valued.length > 0
      ? [{ label: "Est. value", value: formatMoney(totalValue) }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <HoldingsTabs active="/collection" />
      <PageHero
        title="Personal Collection"
        description="Keepers you aren’t selling at all. Unlike Investments, their cost is reported separately from business stock in the Tax Summary. Move anything back if you change your mind."
        stats={items.length > 0 ? stats : undefined}
      />
      <HoldingsTable
        items={items}
        kind="personal"
        empty={
          <>
            Nothing here yet. In{" "}
            <Link href="/inventory" className="text-accent hover:underline">
              Inventory
            </Link>
            , select what you&rsquo;re keeping and choose{" "}
            <span className="font-medium">More → Keep (personal collection)</span>.
          </>
        }
      />
    </div>
  );
}
