import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteExpense } from "@/app/(app)/actions";
import { type Expense } from "@/lib/types";
import ExpenseForm from "@/components/ExpenseForm";

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
    <div className="space-y-10">
      <div>
        <Link href="/expenses" className="text-sm text-zinc-500 hover:underline">
          ← Expenses
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Edit expense</h1>
        <div className="mt-6">
          <ExpenseForm expense={expense} />
        </div>
      </div>

      <div className="max-w-2xl border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <form action={deleteExpense}>
          <input type="hidden" name="id" value={expense.id} />
          <button
            type="submit"
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete expense
          </button>
        </form>
      </div>
    </div>
  );
}
