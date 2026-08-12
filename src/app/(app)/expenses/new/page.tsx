import Link from "next/link";
import ExpenseForm from "@/components/ExpenseForm";

export const metadata = { title: "Add expense · Resale Tracker" };

export default function NewExpensePage() {
  return (
    <div>
      <Link href="/expenses" className="text-sm text-zinc-500 hover:underline">
        ← Expenses
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Add expense</h1>
      <div className="mt-6">
        <ExpenseForm />
      </div>
    </div>
  );
}
