"use client";

import { useActionState } from "react";
import { updateOpenedDate, type FormState } from "@/app/(app)/actions";
import { btnPrimary, field, fieldLabel } from "@/lib/ui";

const inputCls = field;

export default function OpenedForm({
  itemId,
  defaultDate,
}: {
  itemId: string;
  defaultDate?: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateOpenedDate,
    null
  );
  const v = state?.values;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={itemId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={fieldLabel}>Opened date</span>
          <input
            name="opened_at"
            type="date"
            required
            defaultValue={v?.opened_at ?? defaultDate ?? ""}
            className={inputCls}
          />
        </label>
      </div>
      {state?.error && (
        <p className="text-sm text-neg">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={btnPrimary}
      >
        {pending ? "Saving…" : "Update opened date"}
      </button>
    </form>
  );
}
