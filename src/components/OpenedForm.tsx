"use client";

import { useActionState } from "react";
import { updateOpenedDate, type FormState } from "@/app/(app)/actions";

const inputCls =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

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
        <label className="block text-sm">
          <span className="font-medium">Opened date</span>
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
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Update opened date"}
      </button>
    </form>
  );
}
