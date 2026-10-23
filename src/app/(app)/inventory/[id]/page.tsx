import BackLink from "@/components/BackLink";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, isCardCategory, type Item } from "@/lib/types";
import { cardTitle, detailGrid } from "@/lib/ui";
import ItemForm from "@/components/ItemForm";
import GradingPanel from "@/components/GradingPanel";
import { gradingStage } from "@/lib/grading";
import { getDefaultGradingCost, listRippedBoxes } from "@/app/(app)/actions";
import SellForm from "@/components/SellForm";
import OpenedForm from "@/components/OpenedForm";
import DeleteButton from "@/components/DeleteButton";

export const metadata = { title: "Edit item · Resale Tracker" };

/** Where "back" goes: the list this item currently lives in. */
function backTo(item: Item): { href: string; label: string } {
  if (item.sale_date) return { href: "/sales", label: "Sales" };
  if (item.opened_at) return { href: "/ripped", label: "Opened" };
  if (item.invested_at) return { href: "/investments", label: "Investments" };
  if (item.personal_at) return { href: "/collection", label: "Collection" };
  return { href: "/inventory", label: "Inventory" };
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const item = data as Item;

  const { data: catRows } = await supabase.from("items").select("category");
  const categories = [
    ...new Set((catRows ?? []).map((r) => r.category as string)),
  ];
  const boxes = await listRippedBoxes();
  const back = backTo(item);
  // Raw cards lined up for grading, out at the grader, or back from it.
  const showGrading =
    isCardCategory(item.category) &&
    gradingStage(item) !== null &&
    (item.sale_date === null || item.grading_returned_at !== null);
  const defaultGradingCost = showGrading ? await getDefaultGradingCost() : 0;

  return (
    <div className="flex flex-col gap-3">
      <BackLink href={back.href} label={back.label} />

      <ItemForm item={item} categories={categories} boxes={boxes} />

      {/* Separate forms, so they sit below the item form in its left column */}
      <div className={`${detailGrid} mt-1`}>
        <div className="flex min-w-0 flex-col gap-3.5">
          {showGrading && (
            <GradingPanel
              item={item}
              defaultCost={defaultGradingCost}
              today={new Date().toISOString().slice(0, 10)}
            />
          )}

          {item.sale_date && (
            <section className="card px-6 py-[22px]">
              <h2 className={cardTitle}>Sale details</h2>
              <p className="-mt-2 mb-4 text-[13px] text-muted">
                {item.sale_payout === null
                  ? "This sale is missing its payout — fill it in to count the profit."
                  : `Sold on ${formatDate(item.sale_date)} via ${item.sale_platform ?? "an unknown platform"} for ${formatMoney(Number(item.sale_payout))}.`}
              </p>
              <SellForm
                itemId={item.id}
                defaultDate={item.sale_date}
                defaultPlatform={item.sale_platform}
                defaultPayout={item.sale_payout}
                defaultBuyer={item.buyer}
                submitLabel="Update sale"
              />
            </section>
          )}

          {item.opened_at && (
            <section className="card px-6 py-[22px]">
              <h2 className={cardTitle}>Opened</h2>
              <p className="-mt-2 mb-4 text-[13px] text-muted">
                Ripped open on {formatDate(item.opened_at)} — fix the date if
                that isn&rsquo;t right.
              </p>
              <OpenedForm itemId={item.id} defaultDate={item.opened_at} />
            </section>
          )}

          <section className="rounded-[18px] bg-neg-surface px-[22px] py-[18px]">
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="min-w-0">
                <h2 className="text-[13px] font-bold text-neg">Delete this item</h2>
                <p className="mt-1 text-xs text-ink-2">
                  Permanent.{item.sale_date && " Its sale history goes too."}
                </p>
              </div>
              <span className="grow" />
              <DeleteButton
                itemId={item.id}
                back={item.sale_date ? "/sales" : "/inventory"}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
