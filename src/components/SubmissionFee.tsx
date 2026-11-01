"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSubmissionFee } from "@/app/(app)/actions";
import { formatMoney } from "@/lib/types";
import { btnRow, btnText } from "@/lib/ui";

/** "Edit fee" on a submission row: change the total charge and it's re-split
 * across every card in the batch. */
export default function SubmissionFee({
  submittedAt,
  company,
  total,
  cards,
}: {
  submittedAt: string;
  company: string | null;
  total: number;
  cards: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(total));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const n = value.trim() === "" ? null : Number(value);
  const valid = n !== null && Number.isFinite(n) && n >= 0;

  if (!editing) {
    return (
      <button
        type="button"
        className={`${btnRow} whitespace-nowrap`}
        onClick={() => {
          setValue(String(total));
          setError(null);
          setEditing(true);
        }}
      >
        Edit fee
      </button>
    );
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateSubmissionFee({
        submitted_at: submittedAt,
        company,
        total_cost: value,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-1 text-[13px]">
          <span className="text-muted">Total $</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) save();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
            aria-label="Total charge for this submission"
            className="tnum w-24 rounded-[9px] border border-edge bg-surface px-2 py-1.5 text-right text-[13px]"
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
        {valid ? `${formatMoney(n! / cards)} each over ${cards} cards` : "Enter the total"}
        {error && <span className="ml-1.5 text-neg">{error}</span>}
      </span>
    </div>
  );
}
