import BackLink from "@/components/BackLink";
import LotForm from "@/components/LotForm";
import PageHero from "@/components/PageHero";
import { requireUser } from "@/lib/supabase/requireUser";

export const metadata = { title: "Add lot · Resale Tracker" };

export default async function NewLotPage() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("items").select("category");
  if (error) throw new Error(error.message);
  const categories = [...new Set((data ?? []).map((r) => r.category as string))];

  return (
    <div className="flex flex-col gap-3">
      <BackLink href="/lots" label="Lots" />
      <PageHero
        title="Add lot"
        description="A box, pack or bundle you'll open into items. Record the all-in cost now; you'll split it across what you pull when you open it."
      />
      <div className="mt-1">
        <LotForm userId={user.id} categories={categories} />
      </div>
    </div>
  );
}
