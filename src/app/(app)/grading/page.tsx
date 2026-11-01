import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, type Item } from "@/lib/types";
import { breakdown, compareGrades, totals } from "@/lib/grading";
import { getDefaultGradingCost } from "@/app/(app)/actions";
import PageHero, { type Stat } from "@/components/PageHero";
import { AtGrader, ToGrade } from "@/components/GradingBoard";
import { BreakdownTable, GradedCards, MoneyOverview } from "@/components/GradingTables";
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

  // Still in hand and not yet sent: not sold, not ripped, not already graded.
  const toGrade = items.filter(
    (i) =>
      i.plan_to_grade &&
      !i.grading_submitted_at &&
      !i.sale_date &&
      !i.opened_at &&
      i.condition !== "graded"
  );
  const sent = items.filter((i) => i.grading_submitted_at);
  const out = sent.filter((i) => !i.grading_returned_at);
  const back = sent.filter((i) => i.grading_returned_at);

  const t = totals(sent);
  const stats: Stat[] = [
    { label: "Spent", value: formatMoney(t.spent) },
    {
      label: "Profit (sold)",
      value: signedMoney(t.profit),
      tone: t.profit >= 0 ? "pos" : "neg",
    },
    { label: "Held value", value: formatMoney(t.heldValue) },
    { label: "Fees", value: formatMoney(t.fees) },
  ];

  // A batch is the cards sent to one company on one day.
  const byBatch = breakdown(
    sent,
    (i) => `${i.grading_submitted_at}|${i.grade_company ?? "—"}`,
    (k) => {
      const [date, company] = k.split("|");
      return `${formatDate(date)} · ${company}`;
    }
  ).sort((a, b) => b.key.localeCompare(a.key));
  const byGrade = breakdown(back, (i) =>
    `${i.grade_company ?? ""} ${i.grade ?? ""}`.trim() || null
  ).sort((a, b) => {
    const [ca, ga] = [a.key.split(" ")[0], a.key.split(" ").slice(1).join(" ")];
    const [cb, gb] = [b.key.split(" ")[0], b.key.split(" ").slice(1).join(" ")];
    return ca !== cb ? ca.localeCompare(cb) : compareGrades(ga, gb);
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Grading"
        description="What you've put into grading and what's come back. Profit only counts cards you've sold; graded cards you still hold are shown at their value, separately. Cards here stay in Inventory too."
        stats={sent.length > 0 ? stats : undefined}
      />

      {sent.length > 0 && <MoneyOverview t={t} />}

      <ToGrade items={toGrade} defaultCost={defaultCost} today={today} />
      <AtGrader items={out} today={today} />

      <BreakdownTable
        title="By submission"
        description="Each batch sent to a grader on the same day, newest first."
        rows={byBatch}
        firstColumn="Sent"
      />
      <BreakdownTable
        title="By grade"
        description="What each grade has cost and returned. Share is how often you get it."
        rows={byGrade}
        firstColumn="Grade"
        showShare
      />
      <GradedCards items={back} />
    </div>
  );
}
