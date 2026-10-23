import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Item } from "@/lib/types";
import { analyseItem } from "@/lib/grading";
import { getDefaultGradingCost } from "@/app/(app)/actions";
import PageHero, { type Stat } from "@/components/PageHero";
import GradingBoard from "@/components/GradingBoard";
import { signedMoney } from "@/lib/ui";

export const metadata = { title: "Grading · Resale Tracker" };

export default async function GradingPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .or("plan_to_grade.eq.true,grading_submitted_at.not.is.null")
    .order("name");
  if (error) throw new Error(error.message);
  const items = (data ?? []) as Item[];
  const defaultCost = await getDefaultGradingCost();
  const today = new Date().toISOString().slice(0, 10);

  // Candidates are still in hand: not sold, not ripped, not yet sent.
  const candidates = items.filter(
    (i) =>
      i.plan_to_grade &&
      !i.grading_submitted_at &&
      !i.sale_date &&
      !i.opened_at &&
      i.condition !== "graded"
  );
  const submitted = items.filter((i) => i.grading_submitted_at && !i.grading_returned_at);
  const returned = items.filter((i) => i.grading_returned_at);

  const worth = candidates
    .map((i) => analyseItem(i, defaultCost))
    .filter((a) => a?.verdict === "worth");
  const expectedGain = worth.reduce((s, a) => s + (a?.expectedProfit ?? 0), 0);
  const feesPaid = [...submitted, ...returned].reduce(
    (s, i) => s + Number(i.grading_cost ?? 0),
    0
  );

  const stats: Stat[] = [
    { label: "Candidates", value: String(candidates.length) },
    ...(worth.length > 0
      ? [
          {
            label: `${worth.length} worth it`,
            value: signedMoney(expectedGain),
            tone: "pos" as const,
          },
        ]
      : []),
    { label: "At grader", value: String(submitted.length) },
    { label: "Fees paid", value: formatMoney(feesPaid) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHero
        title="Grading"
        description="Weigh up which raw cards are worth sending in, keep track of what's at the grader, and see how your calls turned out. Cards here stay in Inventory too."
        stats={items.length > 0 ? stats : undefined}
      />
      <GradingBoard
        candidates={candidates}
        submitted={submitted}
        returned={returned}
        defaultCost={defaultCost}
        today={today}
      />
    </div>
  );
}
