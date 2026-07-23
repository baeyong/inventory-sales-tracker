import Link from "next/link";
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
    <div className="max-w-2xl">
      <Link href="/inventory" className="text-sm text-zinc-500 hover:underline">
        ← Inventory
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Record a sale</h1>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="font-medium">{item.name}</div>
        <div className="mt-1 text-zinc-500">
          {item.category} · cost {formatMoney(Number(item.purchase_price))}
          {item.purchase_platform && ` · bought at ${item.purchase_platform}`}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="mb-4 text-sm text-zinc-500">
          Enter the net payout you actually received after fees and shipping.
        </p>
        <SellForm itemId={item.id} />
      </div>

      <p className="mt-4 text-sm text-zinc-500">
        Need to fix a detail first?{" "}
        <Link
          href={`/inventory/${item.id}`}
          className="text-blue-600 hover:underline"
        >
          Edit this item
        </Link>
      </p>
    </div>
  );
}
