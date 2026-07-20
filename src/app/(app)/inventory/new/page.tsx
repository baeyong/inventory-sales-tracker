import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ItemForm from "@/components/ItemForm";

export const metadata = { title: "Add item · Resale Tracker" };

export default async function NewItemPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("items").select("category");
  const categories = [...new Set((data ?? []).map((r) => r.category as string))];

  return (
    <div>
      <Link href="/inventory" className="text-sm text-zinc-500 hover:underline">
        ← Inventory
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Add item</h1>
      <div className="mt-6">
        <ItemForm categories={categories} />
      </div>
    </div>
  );
}
