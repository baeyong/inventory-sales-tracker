import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, type Item } from "@/lib/types";
import ItemForm from "@/components/ItemForm";
import SellForm from "@/components/SellForm";
import OpenedForm from "@/components/OpenedForm";
import DeleteButton from "@/components/DeleteButton";

export const metadata = { title: "Edit item · Resale Tracker" };

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

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={item.sale_date ? "/sales" : "/inventory"}
          className="text-sm text-zinc-500 hover:underline"
        >
          ← {item.sale_date ? "Sales" : "Inventory"}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Edit item</h1>
        <div className="mt-6">
          <ItemForm item={item} categories={categories} />
        </div>
      </div>

      {!item.sale_date && (
        <div className="max-w-2xl rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h2 className="font-semibold">Sold it?</h2>
          <p className="mt-1 mb-4 text-sm text-zinc-500">
            Record the sale on its own screen.
          </p>
          <Link
            href={`/inventory/${item.id}/sell`}
            className="inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Mark as sold
          </Link>
        </div>
      )}

      {item.sale_date && (
        <div className="max-w-2xl rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="font-semibold">Sale details</h2>
          <p className="mt-1 mb-4 text-sm text-zinc-500">
            {item.sale_payout === null
              ? "This sale is missing its payout — fill it in to count the profit."
              : `Sold on ${item.sale_date} via ${item.sale_platform ?? "an unknown platform"} for ${formatMoney(Number(item.sale_payout))}.`}
          </p>
          <SellForm
            itemId={item.id}
            defaultDate={item.sale_date}
            defaultPlatform={item.sale_platform}
            defaultPayout={item.sale_payout}
            defaultBuyer={item.buyer}
            submitLabel="Update sale"
          />
        </div>
      )}

      {item.opened_at && (
        <div className="max-w-2xl rounded-xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/30">
          <h2 className="font-semibold">Opened details</h2>
          <p className="mt-1 mb-4 text-sm text-zinc-500">
            Ripped open on {formatDate(item.opened_at)} — fix the date if that
            isn&rsquo;t right.
          </p>
          <OpenedForm itemId={item.id} defaultDate={item.opened_at} />
        </div>
      )}

      <div className="max-w-2xl border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <DeleteButton itemId={item.id} back={item.sale_date ? "/sales" : "/inventory"} />
      </div>
    </div>
  );
}
