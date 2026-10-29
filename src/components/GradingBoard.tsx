"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendToGrading, setPlanToGrade } from "@/app/(app)/actions";
import { GRADE_COMPANIES, costBasis, formatDate, formatMoney, type Item } from "@/lib/types";
import { btnRow, cardTitle, emptyState } from "@/lib/ui";
import {
  SelectionDock,
  dockButton,
  dockClear,
  dockDivider,
  dockPrimary,
} from "@/components/Toolbar";

function cardLine(item: Item): string {
  return [item.card_set, item.card_number ? `#${item.card_number}` : null]
    .filter(Boolean)
    .join(" · ");
}

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
}

export function CardName({ item }: { item: Item }) {
  return (
    <div className="min-w-0">
      <Link href={`/inventory/${item.id}#grading`} className="font-semibold hover:underline">
        {item.name}
      </Link>
      {cardLine(item) && <div className="cap mt-0.5">{cardLine(item)}</div>}
    </div>
  );
}

/** A figure with its label above, for the row layouts. */
export function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-[84px]">
      <div className="cap">{label}</div>
      <div className="tnum mt-0.5 text-[13px]">{children}</div>
    </div>
  );
}

/** The to-grade list, sendable in one go. */
export function ToGrade({
  items,
  defaultCost,
  today,
}: {
  items: Item[];
  defaultCost: number;
  today: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(today);
  const [company, setCompany] = useState("PSA");
  const [cost, setCost] = useState(String(defaultCost));

  const rows = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const pickedCost = rows
    .filter((i) => selected.has(i.id))
    .reduce((s, i) => s + costBasis(i), 0);
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      setSelected(new Set());
      setSending(false);
      router.refresh();
    });
  }

  const feeTotal = (Number(cost) || 0) * selected.size;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className={`${cardTitle} !mb-0`}>To grade</h2>
        {rows.length > 0 && (
          <>
            <span className="text-[13px] text-muted">
              {rows.length} {rows.length === 1 ? "card" : "cards"} lined up
            </span>
            <button
              type="button"
              className="text-[13px] text-accent hover:underline"
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(rows.map((i) => i.id)))
              }
            >
              {allSelected ? "Clear selection" : "Select all"}
            </button>
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <div className={emptyState}>
          Nothing lined up. Open a raw card and tick{" "}
          <span className="font-medium">Plan to grade</span> under its card details.
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {rows.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
              <label className="flex min-w-0 flex-[1_1_240px] items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                  aria-label={`Select ${item.name}`}
                  className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <CardName item={item} />
              </label>
              <Cell label="Cost">{formatMoney(costBasis(item))}</Cell>
              <Cell label="Value">
                {item.est_value === null ? (
                  <span className="text-muted">not set</span>
                ) : (
                  formatMoney(Number(item.est_value))
                )}
              </Cell>
            </li>
          ))}
        </ul>
      )}

      {selected.size > 0 && (
        <SelectionDock>
          <span className="text-[13px] font-semibold">
            {selected.size} selected · {formatMoney(pickedCost)} cost
          </span>
          <span className={dockDivider} />
          {sending ? (
            <>
              <label className="inline-flex items-center">
                <span className="sr-only">Date sent</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-full border-0 bg-dock-2 px-3 py-[7px] text-[13px] text-white"
                />
              </label>
              <label className="inline-flex items-center">
                <span className="sr-only">Company</span>
                <select
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="rounded-full border-0 bg-dock-2 px-3 py-[7px] text-[13px] text-white"
                >
                  {GRADE_COMPANIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex items-center gap-1.5 text-[13px]">
                $
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  aria-label="Grading fee per card"
                  className="w-20 rounded-full border-0 bg-dock-2 px-3 py-[7px] text-[13px] text-white"
                />
                <span className="text-dock-muted">each · {formatMoney(feeTotal)}</span>
              </label>
              <button
                type="button"
                disabled={pending}
                className={dockPrimary}
                onClick={() =>
                  run(() =>
                    sendToGrading([...selected], { submitted_at: date, company, cost })
                  )
                }
              >
                {pending ? "Sending…" : "Mark as sent"}
              </button>
              <button type="button" className={dockClear} onClick={() => setSending(false)}>
                Back
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={pending}
                className={dockPrimary}
                onClick={() => setSending(true)}
              >
                Send to grading
              </button>
              <button
                type="button"
                disabled={pending}
                className={dockButton}
                onClick={() => run(() => setPlanToGrade([...selected], false))}
              >
                Take off list
              </button>
              <button type="button" className={dockClear} onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </>
          )}
          {error && <span className="w-full text-[13px] text-[#ffb4b4]">{error}</span>}
        </SelectionDock>
      )}
    </section>
  );
}

/** Cards out at the grader, longest out first. */
export function AtGrader({ items, today }: { items: Item[]; today: string }) {
  const out = [...items].sort((a, b) =>
    (a.grading_submitted_at ?? "").localeCompare(b.grading_submitted_at ?? "")
  );
  const tiedUp = out.reduce((s, i) => s + costBasis(i), 0);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className={`${cardTitle} !mb-0`}>At the grader</h2>
        {out.length > 0 && (
          <span className="text-[13px] text-muted">
            {out.length} out · {formatMoney(tiedUp)} tied up, fees included
          </span>
        )}
      </div>
      {out.length === 0 ? (
        <div className={emptyState}>Nothing out for grading right now.</div>
      ) : (
        <ul className="card divide-y divide-line">
          {out.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
              <div className="flex min-w-0 flex-[1_1_240px]">
                <CardName item={item} />
              </div>
              <Cell label="Company">{item.grade_company ?? "—"}</Cell>
              <Cell label="Sent">{formatDate(item.grading_submitted_at)}</Cell>
              <Cell label="Out for">{daysBetween(item.grading_submitted_at!, today)} days</Cell>
              <Cell label="Cost + fee">{formatMoney(costBasis(item))}</Cell>
              <Link href={`/inventory/${item.id}#grading`} className={btnRow}>
                Mark returned
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
