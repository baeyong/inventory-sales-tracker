"use client";

import { useActionState, useState } from "react";
import {
  cancelGradingSubmission,
  markGradeReturned,
  sendCardToGrading,
  updateGradingResult,
  type FormState,
} from "@/app/(app)/actions";
import { gainVsRaw, gradingStage } from "@/lib/grading";
import { gradeSearchUrl } from "@/lib/market";
import {
  GRADE_COMPANIES,
  costBasis,
  formatDate,
  formatMoney,
  type Item,
} from "@/lib/types";
import {
  btnPrimary,
  btnSecondary,
  btnText,
  cardTitle,
  field,
  fieldHint,
  fieldLabel,
  signedMoney,
  toneClass,
} from "@/lib/ui";

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
}

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
        {stage === "candidate" && (
          <span className="rounded-full bg-soft px-[11px] py-[5px] text-[11px] font-semibold text-on-soft">
            On your to-grade list
          </span>
        )}
        {stage === "submitted" && (
          <span className="rounded-full bg-soft px-[11px] py-[5px] text-[11px] font-semibold text-on-soft">
            At {company} · {daysBetween(item.grading_submitted_at!, today)} days
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
      ) : stage === "submitted" ? (
        <ReturnForm item={item} today={today} />
      ) : (
        <SendForm item={item} defaultCost={defaultCost} today={today} />
      )}
    </section>
  );
}

function CompanySelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select name="company" defaultValue={defaultValue} className={field}>
      {GRADE_COMPANIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
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
          <CompanySelect defaultValue={v?.company ?? item.grade_company ?? "PSA"} />
        </label>
        <label>
          <span className={fieldLabel}>Fee for this card</span>
          <input
            name="cost"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={v?.cost ?? defaultCost}
            className={`${field} tnum`}
          />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">
        The fee is added to what this card cost you.{" "}
        {item.est_value !== null
          ? `Its value now (${formatMoney(Number(item.est_value))}) is kept as the raw value, to measure what grading adds.`
          : "Set its value first if you want to measure what grading adds."}
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
  const raw = item.grade_values?.raw;
  const company = item.grade_company ?? "PSA";

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={item.id} />
        <h3 className={cardTitle}>Back from grading</h3>
        <p className="-mt-2 text-xs text-muted">
          Sent {formatDate(item.grading_submitted_at)} ·{" "}
          {formatMoney(Number(item.grading_cost ?? 0))} fee, already in its cost
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            <CompanySelect defaultValue={v?.company ?? company} />
          </label>
          <label>
            <span className={fieldLabel}>Grade it got</span>
            <input
              name="grade"
              required
              defaultValue={v?.grade ?? ""}
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
          <label>
            <span className={fieldLabel}>Raw value</span>
            <input
              name="raw_value"
              type="number"
              step="0.01"
              min="0"
              defaultValue={v?.raw_value ?? (raw === undefined ? "" : raw)}
              className={`${field} tnum`}
            />
            <span className={fieldHint}>
              What it was worth ungraded.{" "}
              <a
                href={gradeSearchUrl(item, "raw")}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Raw sold ↗
              </a>
            </span>
          </label>
          <label>
            <span className={fieldLabel}>Worth now</span>
            <input
              name="est_value"
              type="number"
              step="0.01"
              min="0"
              defaultValue={v?.est_value ?? ""}
              className={`${field} tnum`}
            />
            <span className={fieldHint}>Becomes the card&rsquo;s value.</span>
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
  const [editing, setEditing] = useState(false);
  if (editing) return <ResultForm item={item} onDone={() => setEditing(false)} />;

  const raw = item.grade_values?.raw ?? null;
  const fee = Number(item.grading_cost ?? 0);
  const sold = item.sale_date !== null && item.sale_payout !== null;
  const after = sold
    ? Number(item.sale_payout)
    : item.est_value === null
      ? null
      : Number(item.est_value);
  const gain = gainVsRaw(item);
  const profit = after === null ? null : after - costBasis(item);

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      <Fact
        label="Grade"
        value={`${item.grade_company ?? ""} ${item.grade ?? ""}`.trim() || "—"}
      />
      <Fact label="All-in cost" value={formatMoney(costBasis(item))} />
      <Fact label="Fee" value={formatMoney(fee)} />
      <Fact label="Raw value" value={raw === null ? "—" : formatMoney(raw)} />
      <Fact
        label={sold ? "Sold for" : "Worth now"}
        value={after === null ? "—" : formatMoney(after)}
      />
      <Fact
        label="Gain vs raw"
        value={gain === null ? "—" : signedMoney(gain)}
        tone={gain === null ? undefined : gain >= 0 ? "pos" : "neg"}
      />
      {profit !== null && (
        <Fact
          label={sold ? "Profit" : "Paper profit"}
          value={signedMoney(profit)}
          tone={profit >= 0 ? "pos" : "neg"}
        />
      )}
      <p className="col-span-2 text-xs text-muted sm:col-span-3">
        Sent {formatDate(item.grading_submitted_at)}, back{" "}
        {formatDate(item.grading_returned_at)}
        {item.cert_number && <> · cert {item.cert_number}</>}. Gain vs raw is{" "}
        {sold ? "what it sold for" : "its value now"} minus the raw value and the fee.
      </p>
      <div className="col-span-2 sm:col-span-3">
        <button type="button" className={btnSecondary} onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
    </div>
  );
}

/** Edit everything the returned summary is built from. */
function ResultForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const res = await updateGradingResult(prev, formData);
      if (res?.notice) onDone();
      return res;
    },
    null
  );
  const v = state?.values;
  const initialRaw = item.grade_values?.raw;
  const [raw, setRaw] = useState(
    v?.raw_value ?? (initialRaw === undefined ? "" : String(initialRaw))
  );
  const [fee, setFee] = useState(v?.grading_cost ?? String(item.grading_cost ?? 0));
  const [now, setNow] = useState(
    v?.est_value ?? (item.est_value === null ? "" : String(item.est_value))
  );
  const num = (s: string) =>
    s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s);
  const sold = item.sale_date !== null && item.sale_payout !== null;
  // A sold card's gain is measured on what it sold for, not the value field.
  const after = sold ? Number(item.sale_payout) : num(now);
  const rawN = num(raw);
  const gain = rawN !== null && after !== null ? after - rawN - (num(fee) ?? 0) : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={item.id} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label>
          <span className={fieldLabel}>Company</span>
          <CompanySelect defaultValue={v?.company ?? item.grade_company ?? "PSA"} />
        </label>
        <label>
          <span className={fieldLabel}>Grade it got</span>
          <input
            name="grade"
            required
            defaultValue={v?.grade ?? item.grade ?? ""}
            className={`${field} tnum`}
          />
        </label>
        <label>
          <span className={fieldLabel}>Cert number</span>
          <input
            name="cert_number"
            defaultValue={v?.cert_number ?? item.cert_number ?? ""}
            className={`${field} tnum`}
          />
        </label>
        <label>
          <span className={fieldLabel}>Date sent</span>
          <input
            name="submitted_at"
            type="date"
            required
            defaultValue={v?.submitted_at ?? item.grading_submitted_at ?? ""}
            className={`${field} tnum`}
          />
        </label>
        <label>
          <span className={fieldLabel}>Date back</span>
          <input
            name="returned_at"
            type="date"
            required
            defaultValue={v?.returned_at ?? item.grading_returned_at ?? ""}
            className={`${field} tnum`}
          />
        </label>
        <label>
          <span className={fieldLabel}>Fee</span>
          <input
            name="grading_cost"
            type="number"
            step="0.01"
            min="0"
            required
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className={`${field} tnum`}
          />
          <span className={fieldHint}>Part of the card&rsquo;s cost.</span>
        </label>
        <label>
          <span className={fieldLabel}>Raw value</span>
          <input
            name="raw_value"
            type="number"
            step="0.01"
            min="0"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className={`${field} tnum`}
          />
          <span className={fieldHint}>What it was worth ungraded.</span>
        </label>
        <label>
          <span className={fieldLabel}>Worth now</span>
          <input
            name="est_value"
            type="number"
            step="0.01"
            min="0"
            value={now}
            onChange={(e) => setNow(e.target.value)}
            className={`${field} tnum`}
          />
          <span className={fieldHint}>
            {sold ? "Sold — its gain uses the sale instead." : "The card’s value."}
          </span>
        </label>
      </div>
      <p className="rounded-xl bg-inset px-4 py-3 text-[13px] text-ink-2">
        Gain vs raw:{" "}
        {gain === null ? (
          <span className="text-muted">enter the raw value and what it&rsquo;s worth now</span>
        ) : (
          <span className={`tnum font-bold ${toneClass(gain)}`}>{signedMoney(gain)}</span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" disabled={pending} className={btnText} onClick={onDone}>
          Cancel
        </button>
        {state?.error && <span className="text-[13px] text-neg">{state.error}</span>}
      </div>
    </form>
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
