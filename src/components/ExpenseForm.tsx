"use client";

import { useActionState } from "react";
import { createExpense, updateExpense, type FormState } from "@/app/(app)/actions";
import { type Expense } from "@/lib/types";
import { btnPrimary, field, fieldLabel } from "@/lib/ui";

const inputCls = field;

export default function ExpenseForm({ expense }: { expense?: Expense }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    expense ? updateExpense : createExpense,
    null
  );
  // After a failed submit the server echoes what was typed.
  const v = state?.values;

  return (
    <form action={action} className="card max-w-3xl space-y-4 px-6 py-[22px]">
      {expense && <input type="hidden" name="id" value={expense.id} />}

      <label className="block">
        <span className={fieldLabel}>Name</span>
        <input
          name="name"
          required
          defaultValue={v?.name ?? expense?.name}
          placeholder="Penny sleeves, shipping labels, top loaders…"
          className={inputCls}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={fieldLabel}>Amount</span>
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
        <label className="block">
          <span className={fieldLabel}>Date</span>
          <input
            name="spent_on"
            type="date"
            defaultValue={v?.spent_on ?? expense?.spent_on ?? ""}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>Source</span>
          <input
            name="source"
            defaultValue={v?.source ?? expense?.source ?? ""}
            placeholder="Amazon, Uline, USPS…"
            className={inputCls}
          />
        </label>
      </div>

      <label className="block">
        <span className={fieldLabel}>Notes</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={v?.notes ?? expense?.notes ?? ""}
          className={inputCls}
        />
      </label>

      {state?.error && (
        <p className="text-sm text-neg">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={btnPrimary}
      >
        {pending ? "Saving…" : expense ? "Save changes" : "Add expense"}
      </button>
    </form>
  );
}
