import BackLink from "@/components/BackLink";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Item } from "@/lib/types";
import SellForm from "@/components/SellForm";

export const metadata = { title: "Sell item · Resale Tracker" };

export default async function SellItemPage({
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

  // Already sold — editing the sale belongs on the edit page.
  if (item.sale_date) redirect(`/inventory/${item.id}`);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href={`/inventory/${item.id}`} label={item.name} />

      <section className="rounded-[22px] bg-panel px-[22px] py-[22px] sm:px-[26px]">
        <div className="flex flex-wrap items-end gap-6">
          <div className="min-w-0">
            <h1 className="disp text-[26px] font-bold leading-tight">
              Record a sale
            </h1>
            <p className="mt-1.5 text-[13px] text-panel-ink">
              {item.name} · {item.category}
              {item.purchase_platform && ` · bought at ${item.purchase_platform}`}
            </p>
          </div>
          <span className="hidden grow sm:block" />
          <div className="rounded-[14px] bg-surface px-[18px] py-[13px]">
            <div className="cap">Cost</div>
            <div className="disp tnum mt-[3px] text-[21px] font-bold">
              {formatMoney(Number(item.purchase_price))}
            </div>
          </div>
        </div>
      </section>

      <section className="card px-6 py-[22px]">
        <p className="mb-4 text-[13px] text-muted">
          Enter the net payout you actually received after fees and shipping.
        </p>
        <SellForm itemId={item.id} />
      </section>
    </div>
  );
}
