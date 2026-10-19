import BackLink from "@/components/BackLink";
import ExpenseForm from "@/components/ExpenseForm";
import PageHero from "@/components/PageHero";

export const metadata = { title: "Add expense · Resale Tracker" };

export default function NewExpensePage() {
  return (
    <div className="flex flex-col gap-3">
      <BackLink href="/expenses" label="Expenses" />
      <PageHero
        title="Add expense"
        description="Supplies, shipping or fees — anything the business spends that isn’t stock."
      />
      <div className="mt-1">
        <ExpenseForm />
      </div>
    </div>
  );
}
