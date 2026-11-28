"use client";

import { useActionState } from "react";
import { saveBulkThreshold, type LotFormState } from "@/app/(app)/lots/actions";
import { btnSmall, field } from "@/lib/ui";

/** The "under this, it's bulk" line used when opening a lot. */
export default function BulkThresholdForm({ cents }: { cents: number }) {
  const [state, action, pending] = useActionState<LotFormState, FormData>(
    saveBulkThreshold,
    null
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2.5 text-[13px]">
      <label htmlFor="bulk_threshold" className="text-ink-2">
        Pulled items worth less than
      </label>
      <span className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input
          id="bulk_threshold"
          name="bulk_threshold"
          type="number"
          step="0.01"
          min="0"
          defaultValue={state?.values?.bulk_threshold ?? (cents / 100).toFixed(2)}
          className={`${field} tnum w-[110px] pl-6`}
        />
      </span>
      <span className="text-ink-2">start out as bulk ($0 cost).</span>
      <button type="submit" disabled={pending} className={btnSmall}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.error && <span className="text-neg">{state.error}</span>}
      {state?.notice && <span className="text-pos">{state.notice}</span>}
    </form>
  );
}
