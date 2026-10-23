"use client";

import { useActionState, useState } from "react";
import {
  cancelGradingSubmission,
  markGradeReturned,
  saveGradingPlan,
  sendCardToGrading,
  type FormState,
} from "@/app/(app)/actions";
import {
  GRADES,
  ODDS_PRESETS,
  VERDICT_LABEL,
  analyse,
  feeFor,
  gradingStage,
  missingInputs,
  type Verdict,
} from "@/lib/grading";
import { gradeSearchUrl } from "@/lib/market";
import {
  GRADE_COMPANIES,
  formatDate,
  formatMoney,
  type GradeMap,
  type Item,
} from "@/lib/types";
import {
  btnPrimary,
  btnSecondary,
  btnSmall,
  btnText,
  cardTitle,
  field,
  fieldHint,
  fieldLabel,
  signedMoney,
  toneClass,
} from "@/lib/ui";

const VERDICT_CLS: Record<Verdict, string> = {
  worth: "bg-pos-surface text-pos",
  borderline: "bg-warn-surface text-warn",
  skip: "bg-neg-surface text-neg",
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-[11px] py-[5px] text-[11px] font-semibold ${VERDICT_CLS[verdict]}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/** Stored numbers as form strings. */
function asStrings(map: GradeMap | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, n] of Object.entries(map ?? {})) out[k] = String(n);
  return out;
}

/** Form strings back to numbers, skipping blanks and junk. */
function asNumbers(map: Record<string, string>): GradeMap {
  const out: GradeMap = {};
  for (const [k, s] of Object.entries(map)) {
    if (s.trim() === "") continue;
    const n = Number(s);
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
}

function daysSince(iso: string, today: string): number {
  const ms = Date.parse(today) - Date.parse(iso);
  return Math.max(0, Math.round(ms / 86_400_000));
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function GradingPanel({
  item,
  defaultCost,
  today,
}: {
  item: Item;
  defaultCost: number;
  /** YYYY-MM-DD, from the server so it matches on both sides. */
  today: string;
}) {
  const stage = gradingStage(item);
  const company = item.grade_company ?? "PSA";

  return (
    <section id="grading" className="card scroll-mt-4 px-6 py-[22px]">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <h2 className="disp text-[15px] font-bold">Grading</h2>
        {stage === "submitted" && (
          <span className="rounded-full bg-soft px-[11px] py-[5px] text-[11px] font-semibold text-on-soft">
            At {company} · {daysSince(item.grading_submitted_at!, today)} days
          </span>
        )}
        {stage === "returned" && (
          <span className="rounded-full bg-pos-surface px-[11px] py-[5px] text-[11px] font-semibold text-pos">
            Back · {item.grade_company} {item.grade}
          </span>
        )}
      </div>

      {stage === "returned" ? (
        <ReturnedSummary item={item} />
      ) : (
        <>
          <Calculator item={item} defaultCost={defaultCost} />
          <div className="mt-6 border-t border-line pt-5">
            {stage === "submitted" ? (
              <ReturnForm item={item} today={today} />
            ) : (
              <SendForm item={item} defaultCost={defaultCost} today={today} />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Calculator({ item, defaultCost }: { item: Item; defaultCost: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveGradingPlan,
    null
  );
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v = asStrings(item.grade_values);
    // Start raw from the card's own value when there's nothing yet.
    if (v.raw === undefined && item.est_value !== null) v.raw = String(item.est_value);
    return v;
  });
  const [odds, setOdds] = useState<Record<string, string>>(() => asStrings(item.grade_odds));
  const [fee, setFee] = useState<string>(() =>
    item.grade_plan_cost !== null ? String(item.grade_plan_cost) : String(defaultCost)
  );
  // Once sent, the fee actually paid is what counts.
  const paid = item.grading_cost !== null;
  const cost = paid ? feeFor(item, defaultCost) : Number(fee) || 0;

  const input = { values: asNumbers(values), odds: asNumbers(odds), cost };
  const missing = missingInputs(input);
  const result = analyse(input);
  const pop = item.grade_pop ?? {};
  const company = item.grade_company ?? "PSA";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={item.id} />

      <div>
        <span className={fieldLabel}>How does it look?</span>
        <div className="flex flex-wrap gap-2">
          {ODDS_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={btnSmall}
              onClick={() => setOdds(asStrings(p.odds))}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className={fieldHint}>
          Fills in starting chances. Adjust them to what you see on the card.
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] font-semibold tracking-[0.04em] text-muted">
              <th className="pb-2 pr-3 font-semibold">Grade</th>
              <th className="pb-2 pr-3 font-semibold">Worth</th>
              <th className="pb-2 pr-3 font-semibold">Chance %</th>
              <th className="pb-2 pr-3 font-semibold">Pop</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {(["raw", ...GRADES] as string[]).map((g) => (
              <tr key={g}>
                <td className="py-1 pr-3 font-semibold">
                  {g === "raw" ? "Raw" : `${company} ${g}`}
                </td>
                <td className="py-1 pr-3">
                  <input
                    name={`value_${g}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={values[g] ?? ""}
                    onChange={(e) => setValues({ ...values, [g]: e.target.value })}
                    placeholder="$"
                    aria-label={`Worth at ${g === "raw" ? "raw" : `grade ${g}`}`}
                    className={`${field} tnum !py-2`}
                  />
                </td>
                <td className="py-1 pr-3">
                  {g !== "raw" && (
                    <input
                      name={`odds_${g}`}
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={odds[g] ?? ""}
                      onChange={(e) => setOdds({ ...odds, [g]: e.target.value })}
                      placeholder="%"
                      aria-label={`Chance of grade ${g}`}
                      className={`${field} tnum !py-2`}
                    />
                  )}
                </td>
                <td className="py-1 pr-3">
                  {g !== "raw" && (
                    <input
                      name={`pop_${g}`}
                      type="number"
                      step="1"
                      min="0"
                      defaultValue={pop[g] ?? ""}
                      aria-label={`Population at grade ${g}`}
                      className={`${field} tnum !py-2`}
                    />
                  )}
                </td>
                <td className="py-1 text-right">
                  <a
                    href={gradeSearchUrl(item, g, company)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whitespace-nowrap text-xs text-accent hover:underline"
                  >
                    Sold ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {paid ? (
          <div>
            <span className={fieldLabel}>Grading cost</span>
            <div className={`${field} tnum bg-inset text-ink-2`}>
              {formatMoney(cost)}
            </div>
            <span className={fieldHint}>What you paid — it&rsquo;s in the card&rsquo;s cost.</span>
            <input type="hidden" name="grade_plan_cost" value={fee} />
          </div>
        ) : (
          <label>
            <span className={fieldLabel}>Grading cost (per card)</span>
            <input
              name="grade_plan_cost"
              type="number"
              step="0.01"
              min="0"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className={`${field} tnum`}
            />
            <span className={fieldHint}>Tier plus shipping. Not added to the cost until it&rsquo;s sent.</span>
          </label>
        )}
      </div>

      <div className="rounded-xl bg-inset px-4 py-3.5">
        {result ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <VerdictChip verdict={result.verdict} />
              <span className="text-[13px] text-ink-2">
                Expected gain{" "}
                <span className={`tnum font-bold ${toneClass(result.expectedProfit)}`}>
                  {signedMoney(result.expectedProfit)}
                </span>{" "}
                after the {formatMoney(result.cost)} fee
              </span>
            </div>
            <p className="text-xs text-ink-2">
              Expected graded value{" "}
              <span className="tnum font-semibold text-ink">
                {formatMoney(result.expectedValue)}
              </span>{" "}
              vs <span className="tnum">{formatMoney(result.raw)}</span> raw.{" "}
              {result.breakEvenTen === null
                ? (values["10"] ?? "") === ""
                  ? "Add a PSA 10 value to see the break-even."
                  : "No chance of a 10 makes this pay off."
                : result.breakEvenTen === 0
                  ? "It pays off even without a 10."
                  : `Breaks even at a ${pct(result.breakEvenTen)} chance of a 10.`}
            </p>
            {result.belowOdds > 0.005 && (
              <p className="text-xs text-muted">
                The other {pct(result.belowOdds)} (below a 6) is counted at the raw value.
              </p>
            )}
            <p className="text-xs text-muted">
              Selling fees aren&rsquo;t included — they take the same cut of a
              graded or raw sale, so the real gain is a little smaller.
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-muted">{missing}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={btnSecondary}>
          {pending ? "Saving…" : "Save numbers"}
        </button>
        {state?.error && <span className="text-[13px] text-neg">{state.error}</span>}
        {state?.notice && !pending && (
          <span className="text-[13px] text-pos">{state.notice}</span>
        )}
      </div>
    </form>
  );
}

function SendForm({
  item,
  defaultCost,
  today,
}: {
  item: Item;
  defaultCost: number;
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    sendCardToGrading,
    null
  );
  const v = state?.values;
  const fee = item.grade_plan_cost ?? defaultCost;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={item.id} />
      <h3 className={cardTitle}>Send to grading</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label>
          <span className={fieldLabel}>Date sent</span>
          <input
            name="submitted_at"
            type="date"
            required
            defaultValue={v?.submitted_at ?? today}
            className={`${field} tnum`}
          />
        </label>
        <label>
          <span className={fieldLabel}>Company</span>
          <select
            name="company"
            defaultValue={v?.company ?? item.grade_company ?? "PSA"}
            className={field}
          >
            {GRADE_COMPANIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={fieldLabel}>Cost for this card</span>
          <input
            name="cost"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={v?.cost ?? fee}
            className={`${field} tnum`}
          />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">
        The cost is added to what this card cost you, so its profit counts the fee.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Sending…" : "Mark as sent"}
        </button>
        {state?.error && <span className="text-[13px] text-neg">{state.error}</span>}
      </div>
    </form>
  );
}

function ReturnForm({ item, today }: { item: Item; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    markGradeReturned,
    null
  );
  const v = state?.values;
  const values = item.grade_values ?? {};
  const [grade, setGrade] = useState<string>(v?.grade ?? item.grade_predicted ?? "");
  // The value follows the grade picked, until it's typed over.
  const [valueEdited, setValueEdited] = useState<string | null>(v?.est_value ?? null);
  const suggested = values[grade] !== undefined ? String(values[grade]) : "";

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={item.id} />
        <h3 className={cardTitle}>Back from grading</h3>
        <p className="-mt-2 text-xs text-muted">
          Sent {formatDate(item.grading_submitted_at)} ·{" "}
          {formatMoney(Number(item.grading_cost ?? 0))} fee, already in its cost
          {item.grade_predicted && <> · you expected a {item.grade_predicted}</>}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className={fieldLabel}>Date back</span>
            <input
              name="returned_at"
              type="date"
              required
              defaultValue={v?.returned_at ?? today}
              className={`${field} tnum`}
            />
          </label>
          <label>
            <span className={fieldLabel}>Company</span>
            <select
              name="company"
              defaultValue={v?.company ?? item.grade_company ?? "PSA"}
              className={field}
            >
              {GRADE_COMPANIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={fieldLabel}>Grade it got</span>
            <input
              name="grade"
              required
              value={grade}
              onChange={(e) => setGrade(e.target.value.trim())}
              placeholder="10"
              className={`${field} tnum`}
            />
          </label>
          <label>
            <span className={fieldLabel}>Cert number</span>
            <input
              name="cert_number"
              defaultValue={v?.cert_number ?? ""}
              className={`${field} tnum`}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={fieldLabel}>Worth now</span>
            <input
              name="est_value"
              type="number"
              step="0.01"
              min="0"
              value={valueEdited ?? suggested}
              onChange={(e) => setValueEdited(e.target.value)}
              className={`${field} tnum`}
            />
            <span className={fieldHint}>
              Filled from your value for that grade. Becomes the card&rsquo;s value.
            </span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? "Saving…" : "Mark returned"}
          </button>
          {state?.error && <span className="text-[13px] text-neg">{state.error}</span>}
        </div>
      </form>
      <form action={cancelGradingSubmission}>
        <input type="hidden" name="id" value={item.id} />
        <button type="submit" className={btnText}>
          Not sent after all? Undo the submission
        </button>
      </form>
    </div>
  );
}

function ReturnedSummary({ item }: { item: Item }) {
  const values = item.grade_values ?? {};
  const raw = values.raw;
  const fee = Number(item.grading_cost ?? 0);
  const now = item.est_value === null ? null : Number(item.est_value);
  const gain = raw !== undefined && now !== null ? now - raw - fee : null;
  const hit = item.grade_predicted !== null && item.grade_predicted === item.grade;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Fact label="Expected" value={item.grade_predicted ?? "—"} />
      <Fact
        label="Got"
        value={`${item.grade_company ?? ""} ${item.grade ?? ""}`.trim() || "—"}
        tone={item.grade_predicted === null ? undefined : hit ? "pos" : undefined}
      />
      <Fact label="Fee" value={formatMoney(fee)} />
      <Fact
        label="Gain vs raw"
        value={gain === null ? "—" : signedMoney(gain)}
        tone={gain === null ? undefined : gain >= 0 ? "pos" : "neg"}
      />
      <p className="col-span-2 text-xs text-muted sm:col-span-4">
        Sent {formatDate(item.grading_submitted_at)}, back{" "}
        {formatDate(item.grading_returned_at)}
        {item.cert_number && <> · cert {item.cert_number}</>}. Gain is its value
        now minus the raw value and the fee.
      </p>
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  const ink = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "";
  return (
    <div className="rounded-xl bg-inset px-3.5 py-3">
      <div className="cap">{label}</div>
      <div className={`disp tnum mt-1 text-[17px] font-bold ${ink}`}>{value}</div>
    </div>
  );
}
