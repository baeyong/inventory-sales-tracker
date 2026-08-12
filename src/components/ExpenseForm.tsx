"use client";

import { useActionState } from "react";
import { createExpense, updateExpense, type FormState } from "@/app/(app)/actions";
import { type Expense } from "@/lib/types";

const inputCls =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export default function ExpenseForm({ expense }: { expense?: Expense }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    expense ? updateExpense : createExpense,
    null
  );
  // After a failed submit the server echoes what was typed.
  const v = state?.values;

  return (
    <form action={action} className="max-w-2xl space-y-4">
      {expense && <input type="hidden" name="id" value={expense.id} />}

      <label className="block text-sm">
        <span className="font-medium">Name</span>
        <input
          name="name"
          required
          defaultValue={v?.name ?? expense?.name}
          placeholder="Penny sleeves, shipping labels, top loaders…"
          className={inputCls}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium">Amount</span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={v?.amount ?? expense?.amount}
            placeholder="0.00"
            className={inputCls}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Date</span>
          <input
            name="spent_on"
            type="date"
            defaultValue={v?.spent_on ?? expense?.spent_on ?? ""}
            className={inputCls}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Source</span>
          <input
            name="source"
            defaultValue={v?.source ?? expense?.source ?? ""}
            placeholder="Amazon, Uline, USPS…"
            className={inputCls}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium">Notes</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={v?.notes ?? expense?.notes ?? ""}
          className={inputCls}
        />
      </label>

      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : expense ? "Save changes" : "Add expense"}
      </button>
    </form>
  );
}
