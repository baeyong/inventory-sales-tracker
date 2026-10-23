import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { costBasis, formatMoney, type Item } from "@/lib/types";
import InventoryTable from "@/components/InventoryTable";
import FilterBar from "@/components/FilterBar";
import PageHero from "@/components/PageHero";
import { HoldingsTabs } from "@/components/SectionTabs";
import { btnPrimary, signedMoney } from "@/lib/ui";

export const metadata = { title: "Inventory · Resale Tracker" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const category =
    typeof params.category === "string" ? params.category : "";
  const listed =
    params.listed === "yes" ? true : params.listed === "no" ? false : null;

  const supabase = await createClient();

  let query = supabase
    .from("items")
    .select("*")
    .is("sale_date", null)
    .is("opened_at", null)
    .is("invested_at", null)
    .is("personal_at", null)
    .order("created_at", { ascending: false });
  if (category) query = query.eq("category", category);
  if (listed !== null) query = query.eq("listed", listed);
  const { data } = await query;
  const items = (data ?? []) as Item[];

  const { data: catRows } = await supabase
    .from("items")
    .select("category")
    .is("sale_date", null)
    .is("opened_at", null)
    .is("invested_at", null)
    .is("personal_at", null);
  const categories = [
    ...new Set((catRows ?? []).map((r) => r.category as string)),
  ].sort();

  const totalCost = items.reduce((sum, i) => sum + costBasis(i), 0);
  const valued = items.filter((i) => i.est_value !== null);
  const totalValue = valued.reduce((sum, i) => sum + Number(i.est_value), 0);
  const potential = totalValue - valued.reduce(
    (sum, i) => sum + costBasis(i),
    0
  );

  const notListed = items.filter((i) => !i.listed).length;

  return (
    <div className="flex flex-col gap-4">
      <HoldingsTabs active="/inventory" />

      <PageHero
        title="Inventory"
        description="Items held for sale. Opened boxes, long-term holdings and keepers live in the other tabs."
        stats={[
          { label: "Invested", value: formatMoney(totalCost) },
          ...(valued.length > 0
            ? ([
                { label: "Est. value", value: formatMoney(totalValue) },
                {
                  label: "Potential",
                  value: signedMoney(potential),
                  tone: potential >= 0 ? "pos" : "neg",
                },
              ] as const)
            : []),
        ]}
      >
        {notListed > 0 && listed === null && (
          <Link
            href="/inventory?listed=no"
            className="mt-2 inline-block text-[13px] font-semibold text-warn hover:underline"
          >
            {notListed} not listed yet →
          </Link>
        )}
      </PageHero>

      <InventoryTable
        items={items}
        toolbar={<FilterBar categories={categories} showListed />}
        action={
          <Link href="/inventory/new" className={btnPrimary}>
            Add item
          </Link>
        }
        empty={
          category || listed !== null ? (
            "No inventory matches these filters."
          ) : (
            <>
              Nothing in inventory yet. Add your first item or{" "}
              <Link href="/data" className="text-accent hover:underline">
                import a spreadsheet
              </Link>
              .
            </>
          )
        }
      />
    </div>
  );
}
