import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Expense } from "@/lib/types";
import ExpensesTable from "@/components/ExpensesTable";
import PageHero from "@/components/PageHero";
import { btnPrimary } from "@/lib/ui";

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
    <div className="flex flex-col gap-4">
      <PageHero
        title="Expenses"
        description="Business costs that aren’t inventory — supplies, shipping, fees. They feed the Tax Summary."
        stats={
          expenses.length > 0
            ? [
                { label: "Total", value: formatMoney(total) },
                { label: "Entries", value: String(expenses.length) },
              ]
            : undefined
        }
      />
      <ExpensesTable
        expenses={expenses}
        action={
          <Link href="/expenses/new" className={btnPrimary}>
            Add expense
          </Link>
        }
        empty="No expenses yet. Add supplies, shipping materials or fees with Add expense."
      />
    </div>
  );
}
