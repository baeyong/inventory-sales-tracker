"use client";

import { useActionState } from "react";
import { markSold, type FormState } from "@/app/(app)/actions";
import { PLATFORM_SUGGESTIONS } from "@/lib/types";
import { btnPrimary, field, fieldHint, fieldLabel } from "@/lib/ui";

const inputCls = field;

export default function SellForm({
  itemId,
  defaultDate,
  defaultPlatform,
  defaultPayout,
  defaultBuyer,
  submitLabel = "Mark as sold",
}: {
  itemId: string;
  defaultDate?: string | null;
  defaultPlatform?: string | null;
  defaultPayout?: number | null;
  defaultBuyer?: string | null;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    markSold,
    null
  );
  const v = state?.values;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={itemId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={fieldLabel}>Sale date</span>
          <input
            name="sale_date"
            type="date"
            required
            defaultValue={v?.sale_date ?? defaultDate ?? new Date().toISOString().slice(0, 10)}
            className={inputCls}
          />
          <span className={fieldHint}>
            Defaults to today — click to pick the real date.
          </span>
        </label>
        <label className="block">
          <span className={fieldLabel}>Platform</span>
          <input
            name="sale_platform"
            required
            list="platforms"
            defaultValue={v?.sale_platform ?? defaultPlatform ?? ""}
            placeholder="eBay"
            className={inputCls}
          />
          <datalist id="platforms">
            {PLATFORM_SUGGESTIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className={fieldLabel}>Net payout</span>
          <input
            name="sale_payout"
            type="number"
            step="0.01"
            required
            defaultValue={v?.sale_payout ?? defaultPayout ?? undefined}
            placeholder="After fees & shipping (can be negative)"
            className={inputCls}
          />
        </label>
      </div>
      <label className="block">
        <span className={fieldLabel}>Buyer (name / username)</span>
        <input
          name="buyer"
          defaultValue={v?.buyer ?? defaultBuyer ?? ""}
          placeholder="Who bought it — optional"
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
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
