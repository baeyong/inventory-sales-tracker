import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Expense } from "@/lib/types";
import ExpensesTable from "@/components/ExpensesTable";

export const metadata = { title: "Expenses · Resale Tracker" };

export default async function ExpensesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("expenses")
    .select("*")
    .order("spent_on", { ascending: false });
  const expenses = (data ?? []) as Expense[];

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Expenses</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Business costs that aren&rsquo;t inventory — supplies, shipping,
            fees. They feed the Tax Summary.
            {expenses.length > 0 && (
              <>
                {" "}
                <span className="font-medium">
                  {expenses.length}{" "}
                  {expenses.length === 1 ? "expense" : "expenses"} ·{" "}
                  {formatMoney(total)} total
                </span>
              </>
            )}
          </p>
        </div>
        <Link
          href="/expenses/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add expense
        </Link>
      </div>

      {expenses.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No expenses yet. Add supplies, shipping materials, or fees with{" "}
          <Link href="/expenses/new" className="text-blue-600 hover:underline">
            + Add expense
          </Link>
          .
        </div>
      ) : (
        <div className="mt-6">
          <ExpensesTable expenses={expenses} />
        </div>
      )}
    </div>
  );
}
