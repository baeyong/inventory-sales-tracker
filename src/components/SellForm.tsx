"use client";

import { useActionState, useState } from "react";
import { markSold, type FormState } from "@/app/(app)/actions";
import { PLATFORM_SUGGESTIONS, formatMoney } from "@/lib/types";
import { btnPrimary, field, fieldHint, fieldLabel } from "@/lib/ui";

const inputCls = field;

const dollars = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);

export default function SellForm({
  itemId,
  defaultDate,
  defaultPlatform,
  defaultPayout,
  defaultBuyer,
  defaultGrossCents,
  defaultFeesCents,
  defaultShippingCents,
  submitLabel = "Mark as sold",
}: {
  itemId: string;
  defaultDate?: string | null;
  defaultPlatform?: string | null;
  defaultPayout?: number | null;
  defaultBuyer?: string | null;
  defaultGrossCents?: number | null;
  defaultFeesCents?: number | null;
  defaultShippingCents?: number | null;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    markSold,
    null
  );
  const v = state?.values;

  // Optional breakdown: with a sale price filled in, the net payout is
  // worked out from it (price − fees − shipping) instead of typed.
  const [gross, setGross] = useState(v?.sale_gross ?? dollars(defaultGrossCents));
  const [fees, setFees] = useState(v?.sale_fees ?? dollars(defaultFeesCents));
  const [shipping, setShipping] = useState(v?.sale_shipping ?? dollars(defaultShippingCents));
  const hasGross = gross.trim() !== "";
  const net = hasGross
    ? (Number(gross) || 0) - (Number(fees) || 0) - (Number(shipping) || 0)
    : null;

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
          {hasGross ? (
            <>
              <div className={`${inputCls} tnum bg-inset text-ink-2`}>
                {formatMoney(net ?? 0)}
              </div>
              <span className={fieldHint}>Sale price − fees − shipping.</span>
            </>
          ) : (
            <input
              name="sale_payout"
              type="number"
              step="0.01"
              required
              defaultValue={v?.sale_payout ?? defaultPayout ?? undefined}
              placeholder="After fees & shipping (can be negative)"
              className={inputCls}
            />
          )}
        </label>
      </div>

      <fieldset className="rounded-[14px] bg-inset px-4 py-3.5">
        <legend className="sr-only">Sale breakdown</legend>
        <p className="mb-3 text-xs text-muted">
          Optional, for the tax report: enter the sale price and what came off
          it, and the net payout is worked out for you.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={fieldLabel}>Sale price</span>
            <input
              name="sale_gross"
              type="number"
              step="0.01"
              min="0"
              value={gross}
              onChange={(e) => setGross(e.target.value)}
              placeholder="0.00"
              className={`${inputCls} tnum`}
            />
          </label>
          <label className="block">
            <span className={fieldLabel}>Fees</span>
            <input
              name="sale_fees"
              type="number"
              step="0.01"
              min="0"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
              disabled={!hasGross}
              placeholder="0.00"
              className={`${inputCls} tnum disabled:opacity-50`}
            />
          </label>
          <label className="block">
            <span className={fieldLabel}>Shipping</span>
            <input
              name="sale_shipping"
              type="number"
              step="0.01"
              min="0"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              disabled={!hasGross}
              placeholder="0.00"
              className={`${inputCls} tnum disabled:opacity-50`}
            />
          </label>
        </div>
      </fieldset>

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
