"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendToGrading, setPlanToGrade } from "@/app/(app)/actions";
import { analyseItem, feeFor, type GradingAnalysis } from "@/lib/grading";
import { GRADE_COMPANIES, formatDate, formatMoney, type Item } from "@/lib/types";
import { btnRow, cardTitle, emptyState, signedMoney, toneClass } from "@/lib/ui";
import {
  SelectionDock,
  dockButton,
  dockClear,
  dockDivider,
  dockPrimary,
} from "@/components/Toolbar";
import { VerdictChip } from "@/components/GradingPanel";

function cardLine(item: Item): string {
  return [item.card_set, item.card_number ? `#${item.card_number}` : null]
    .filter(Boolean)
    .join(" · ");
}

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Name({ item }: { item: Item }) {
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
function Cell({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-[84px] ${className}`}>
      <div className="cap">{label}</div>
      <div className="tnum mt-0.5 text-[13px]">{children}</div>
    </div>
  );
}

export default function GradingBoard({
  candidates,
  submitted,
  returned,
  defaultCost,
  today,
}: {
  candidates: Item[];
  submitted: Item[];
  returned: Item[];
  defaultCost: number;
  today: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Candidates items={candidates} defaultCost={defaultCost} today={today} />
      <Submitted items={submitted} today={today} />
      <Returned items={returned} />
    </div>
  );
}

function Candidates({
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

  // Best bets first; cards still missing numbers at the bottom.
  const rows = items
    .map((item) => ({ item, a: analyseItem(item, defaultCost) }))
    .sort((x, y) => {
      if (!x.a && !y.a) return x.item.name.localeCompare(y.item.name);
      if (!x.a) return 1;
      if (!y.a) return -1;
      return y.a.expectedProfit - x.a.expectedProfit;
    });

  const picked = rows.filter((r) => selected.has(r.item.id));
  // Totals for the selection, or for every card worth grading when nothing's
  // ticked.
  const basis = picked.length > 0 ? picked : rows.filter((r) => r.a?.verdict === "worth");
  const basisFee = basis.reduce((s, r) => s + feeFor(r.item, defaultCost), 0);
  const basisGain = basis.reduce((s, r) => s + (r.a?.expectedProfit ?? 0), 0);

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

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className={`${cardTitle} !mb-0`}>Candidates</h2>
        <span className="text-[13px] text-muted">
          Cards you&rsquo;re thinking about grading, best bets first.
        </span>
      </div>

      {items.length === 0 ? (
        <div className={emptyState}>
          No cards lined up yet. Open a raw card and tick{" "}
          <span className="font-medium">Plan to grade</span> under its card details.
        </div>
      ) : (
        <>
          {basis.length > 0 && (
            <p className="mb-3 text-[13px] text-ink-2">
              {picked.length > 0
                ? `Grading the ${basis.length} selected`
                : `Grading the ${basis.length} worth it`}{" "}
              {basis.length === 1 ? "card costs" : "cards costs"}{" "}
              <span className="tnum font-semibold text-ink">{formatMoney(basisFee)}</span>, expected
              gain{" "}
              <span className={`tnum font-semibold ${toneClass(basisGain)}`}>
                {signedMoney(basisGain)}
              </span>
              .
            </p>
          )}
          <ul className="card divide-y divide-line">
            {rows.map(({ item, a }) => (
              <CandidateRow
                key={item.id}
                item={item}
                a={a}
                fee={feeFor(item, defaultCost)}
                checked={selected.has(item.id)}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </ul>
        </>
      )}

      {selected.size > 0 && (
        <SelectionDock>
          <span className="text-[13px] font-semibold">{selected.size} selected</span>
          <span className={dockDivider} />
          {sending ? (
            <>
              <label className="inline-flex items-center gap-2 text-[13px]">
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
                  aria-label="Grading cost per card"
                  className="w-20 rounded-full border-0 bg-dock-2 px-3 py-[7px] text-[13px] text-white"
                />
                <span className="text-dock-muted">each</span>
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
                Remove from plan
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

function CandidateRow({
  item,
  a,
  fee,
  checked,
  onToggle,
}: {
  item: Item;
  a: GradingAnalysis | null;
  fee: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
      <label className="flex min-w-0 flex-[1_1_240px] items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select ${item.name}`}
          className="h-4 w-4 shrink-0 accent-[var(--accent)]"
        />
        <Name item={item} />
      </label>
      {a ? (
        <>
          <Cell label="Raw">{formatMoney(a.raw)}</Cell>
          <Cell label="Expected">{formatMoney(a.expectedValue)}</Cell>
          <Cell label="Fee">{formatMoney(fee)}</Cell>
          <Cell label="Gain">
            <span className={`font-bold ${toneClass(a.expectedProfit)}`}>
              {signedMoney(a.expectedProfit)}
            </span>
          </Cell>
          <Cell label="Break-even 10">
            {a.breakEvenTen === null ? "—" : pct(a.breakEvenTen)}
          </Cell>
          <VerdictChip verdict={a.verdict} />
        </>
      ) : (
        <Link href={`/inventory/${item.id}#grading`} className={btnRow}>
          Add its numbers
        </Link>
      )}
    </li>
  );
}

function Submitted({ items, today }: { items: Item[]; today: string }) {
  const out = [...items].sort((a, b) =>
    (a.grading_submitted_at ?? "").localeCompare(b.grading_submitted_at ?? "")
  );
  const fees = out.reduce((s, i) => s + Number(i.grading_cost ?? 0), 0);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className={`${cardTitle} !mb-0`}>At the grader</h2>
        {out.length > 0 && (
          <span className="text-[13px] text-muted">
            {out.length} out · {formatMoney(fees)} in fees · longest out first
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
                <Name item={item} />
              </div>
              <Cell label="Company">{item.grade_company ?? "—"}</Cell>
              <Cell label="Sent">{formatDate(item.grading_submitted_at)}</Cell>
              <Cell label="Out for">
                {daysBetween(item.grading_submitted_at!, today)} days
              </Cell>
              <Cell label="Fee">{formatMoney(Number(item.grading_cost ?? 0))}</Cell>
              <Cell label="Expecting">{item.grade_predicted ?? "—"}</Cell>
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

function Returned({ items }: { items: Item[] }) {
  const back = [...items].sort((a, b) =>
    (b.grading_returned_at ?? "").localeCompare(a.grading_returned_at ?? "")
  );
  const gainOf = (i: Item) => {
    const raw = i.grade_values?.raw;
    if (raw === undefined || i.est_value === null) return null;
    return Number(i.est_value) - raw - Number(i.grading_cost ?? 0);
  };
  const fees = back.reduce((s, i) => s + Number(i.grading_cost ?? 0), 0);
  const gains = back.map(gainOf).filter((g): g is number => g !== null);
  const totalGain = gains.reduce((s, g) => s + g, 0);
  const called = back.filter((i) => i.grade_predicted !== null);
  const hits = called.filter((i) => i.grade_predicted === i.grade).length;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className={`${cardTitle} !mb-0`}>Back from grading</h2>
      </div>
      {back.length === 0 ? (
        <div className={emptyState}>
          Graded cards show up here with what you expected against what they got.
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2.5">
            <Summary label="Fees paid" value={formatMoney(fees)} />
            {gains.length > 0 && (
              <Summary
                label="Gain vs raw"
                value={signedMoney(totalGain)}
                tone={totalGain >= 0 ? "pos" : "neg"}
              />
            )}
            {called.length > 0 && (
              <Summary
                label="Called it"
                value={`${hits} of ${called.length}`}
                hint={`${pct(hits / called.length)} got the grade you expected`}
              />
            )}
          </div>
          <ul className="card divide-y divide-line">
            {back.map((item) => {
              const gain = gainOf(item);
              const hit = item.grade_predicted !== null && item.grade_predicted === item.grade;
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4"
                >
                  <div className="flex min-w-0 flex-[1_1_240px]">
                    <Name item={item} />
                  </div>
                  <Cell label="Expected">{item.grade_predicted ?? "—"}</Cell>
                  <Cell label="Got">
                    <span className={hit ? "font-bold text-pos" : "font-bold"}>
                      {`${item.grade_company ?? ""} ${item.grade ?? ""}`.trim() || "—"}
                    </span>
                  </Cell>
                  <Cell label="Back">{formatDate(item.grading_returned_at)}</Cell>
                  <Cell label="Fee">{formatMoney(Number(item.grading_cost ?? 0))}</Cell>
                  <Cell label="Gain vs raw">
                    {gain === null ? (
                      "—"
                    ) : (
                      <span className={`font-bold ${toneClass(gain)}`}>{signedMoney(gain)}</span>
                    )}
                  </Cell>
                  {item.sale_date && (
                    <span className="rounded-full bg-pos-surface px-[11px] py-[5px] text-[11px] font-semibold text-pos">
                      Sold
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Summary({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  hint?: string;
}) {
  const ink = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "";
  return (
    <div className="min-w-[120px] rounded-[14px] bg-surface px-[18px] py-[13px] shadow-pill" title={hint}>
      <div className="cap">{label}</div>
      <div className={`disp tnum mt-[3px] text-[19px] font-bold ${ink}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
