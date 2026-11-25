"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSubmissionFee } from "@/app/(app)/actions";
import { formatMoney } from "@/lib/types";
import { btnRow, btnText } from "@/lib/ui";

const input =
  "tnum w-24 rounded-[9px] border border-edge bg-surface px-2 py-1.5 text-right text-[13px]";

/** "Edit costs" on a submission row: change what the grader charged and what
 * shipping cost, and each is re-split across every card in the batch. */
export default function SubmissionFee({
  submissionId,
  total,
  shipping,
  cards,
}: {
  submissionId: string;
  /** What the grader charged for the whole submission. */
  total: number;
  /** What shipping it in cost. */
  shipping: number;
  cards: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(total));
  const [ship, setShip] = useState(String(shipping));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const n = value.trim() === "" ? null : Number(value);
  const s = ship.trim() === "" ? 0 : Number(ship);
  const valid = n !== null && Number.isFinite(n) && n >= 0 && Number.isFinite(s) && s >= 0;

  if (!editing) {
    return (
      <button
        type="button"
        className={`${btnRow} whitespace-nowrap`}
        onClick={() => {
          setValue(String(total));
          setShip(String(shipping));
          setError(null);
          setEditing(true);
        }}
      >
        Edit costs
      </button>
    );
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateSubmissionFee({
        submission_id: submissionId,
        total_cost: value,
        shipping_cost: ship,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && valid) save();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-1 text-[13px]">
          <span className="text-muted">Grader $</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            aria-label="What the grader charged for this submission"
            className={input}
          />
        </label>
        <label className="inline-flex items-center gap-1 text-[13px]">
          <span className="text-muted">Shipping $</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={ship}
            onChange={(e) => setShip(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="0"
            aria-label="What shipping this submission in cost"
            className={input}
          />
        </label>
        <button
          type="button"
          disabled={pending || !valid}
          onClick={save}
          className={`${btnRow} whitespace-nowrap`}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(false)}
          className={btnText}
        >
          Cancel
        </button>
      </div>
      <span className="text-[11px] text-muted">
        {valid
          ? `${formatMoney((n! + s) / cards)} each over ${cards} cards`
          : "Enter the grader's total"}
        {error && <span className="ml-1.5 text-neg">{error}</span>}
      </span>
    </div>
  );
}
