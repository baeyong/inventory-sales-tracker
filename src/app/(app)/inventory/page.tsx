import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Item } from "@/lib/types";
import InventoryTable from "@/components/InventoryTable";
import FilterBar from "@/components/FilterBar";

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
    .order("created_at", { ascending: false });
  if (category) query = query.eq("category", category);
  if (listed !== null) query = query.eq("listed", listed);
  const { data } = await query;
  const items = (data ?? []) as Item[];

  const { data: catRows } = await supabase
    .from("items")
    .select("category")
    .is("sale_date", null);
  const categories = [
    ...new Set((catRows ?? []).map((r) => r.category as string)),
  ].sort();

  const totalCost = items.reduce((sum, i) => sum + Number(i.purchase_price), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {items.length} unsold {items.length === 1 ? "item" : "items"} ·{" "}
            {formatMoney(totalCost)} invested
          </p>
          {items.some((i) => !i.listed) && (
            <p className="mt-1 text-sm font-medium">
              <Link
                href="/inventory?listed=no"
                className="text-amber-700 hover:underline dark:text-amber-400"
              >
                {items.filter((i) => !i.listed).length} not listed yet →
              </Link>
            </p>
          )}
        </div>
        <Link
          href="/inventory/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add item
        </Link>
      </div>

      <div className="mt-3">
        <FilterBar categories={categories} showListed />
      </div>

      {items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {category || listed !== null ? (
            "No inventory matches these filters."
          ) : (
            <>
              Nothing in inventory yet. Add your first item or{" "}
              <Link href="/import" className="text-blue-600 hover:underline">
                import a spreadsheet
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <InventoryTable items={items} />
        </div>
      )}
    </div>
  );
}
