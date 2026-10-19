import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Item } from "@/lib/types";
import OpenedBoxes from "@/components/OpenedBoxes";
import PageHero from "@/components/PageHero";

export const metadata = { title: "Opened boxes · Resale Tracker" };

export default async function RippedPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .not("opened_at", "is", null)
    .order("opened_at", { ascending: false });
  if (error) throw new Error(error.message);
  const boxes = (data ?? []) as Item[];

  // Every card pulled from a box, wherever it is now — still held, sold, or
  // moved to Investments or the Collection.
  const { data: pullRows, error: pullError } = await supabase
    .from("items")
    .select("*")
    .not("ripped_from_id", "is", null)
    .order("name");
  if (pullError) throw new Error(pullError.message);
  const pulls = (pullRows ?? []) as Item[];

  const totalCost = boxes.reduce((sum, i) => sum + Number(i.purchase_price), 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHero
        title="Opened boxes"
        description={
          <>
            Sealed product you ripped — <em>for the love of the game</em>. Each
            box&rsquo;s cost is split evenly across the cards pulled from it, so
            your card costs always add back up to what the box cost.
          </>
        }
        stats={
          boxes.length > 0
            ? [
                { label: "Boxes", value: String(boxes.length) },
                { label: "Cost in", value: formatMoney(totalCost) },
                { label: "Pulls", value: String(pulls.length) },
              ]
            : undefined
        }
      />
      <OpenedBoxes boxes={boxes} pulls={pulls} />
    </div>
  );
}
