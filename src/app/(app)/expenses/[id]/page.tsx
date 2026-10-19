import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteExpense } from "@/app/(app)/actions";
import { type Expense } from "@/lib/types";
import ExpenseForm from "@/components/ExpenseForm";
import BackLink from "@/components/BackLink";
import PageHero from "@/components/PageHero";
import { btnDanger } from "@/lib/ui";

export const metadata = { title: "Edit expense · Resale Tracker" };

export default async function ExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const expense = data as Expense;

  return (
    <div className="flex flex-col gap-3">
      <BackLink href="/expenses" label="Expenses" />
      <PageHero title={expense.name} description="Edit this expense." />
      <div className="mt-1">
        <ExpenseForm expense={expense} />
      </div>
      <section className="max-w-3xl rounded-[18px] bg-neg-surface px-[22px] py-[18px]">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold text-neg">Delete this expense</h2>
            <p className="mt-1 text-xs text-ink-2">Permanent.</p>
          </div>
          <span className="grow" />
          <form action={deleteExpense}>
            <input type="hidden" name="id" value={expense.id} />
            <button type="submit" className={btnDanger}>
              Delete
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
