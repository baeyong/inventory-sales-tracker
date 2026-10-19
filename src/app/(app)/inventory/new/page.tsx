import BackLink from "@/components/BackLink";
import { createClient } from "@/lib/supabase/server";
import ItemForm from "@/components/ItemForm";
import { listRippedBoxes } from "@/app/(app)/actions";

export const metadata = { title: "Add item · Resale Tracker" };

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("items").select("category");
  const categories = [...new Set((data ?? []).map((r) => r.category as string))];
  const boxes = await listRippedBoxes();
  // "Add a pull" on the Opened page links here with the box already chosen.
  const from =
    typeof params.from === "string" && boxes.some((b) => b.id === params.from)
      ? params.from
      : "";

  return (
    <div className="flex flex-col gap-3">
      <BackLink href={from ? "/ripped" : "/inventory"} label={from ? "Opened" : "Inventory"} />
      <ItemForm categories={categories} boxes={boxes} defaultRippedFrom={from} />
    </div>
  );
}
