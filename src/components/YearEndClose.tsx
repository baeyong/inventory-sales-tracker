"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeYear, reopenYear } from "@/app/(app)/year-end/actions";
import { planClose, type CloseCandidate } from "@/lib/writedown";
import { formatCents, parseCents } from "@/lib/money";
import {
  btnDanger,
  btnPrimary,
  btnSecondary,
  field,
  fieldLabel,
  modalOverlay,
  modalPanel,
  td,
  th,
} from "@/lib/ui";

const key = (c: CloseCandidate) => `${c.kind}:${c.id}`;

/** The close screen: everything on hand at Dec 31 with its basis, a market
 * value per row (pre-filled from the latest estimate), and the write-down
 * that follows. Confirming saves the snapshot and applies the write-downs. */
export default function YearEndClose({
  year,
  candidates,
  blocked,
}: {
  year: number;
  candidates: CloseCandidate[];
  /** Why the year can't be closed right now, if it can't. */
  blocked: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      candidates.map((c) => [key(c), c.estimateCents === null ? "" : (c.estimateCents / 100).toFixed(2)])
    )
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const markets: Record<string, number | null> = {};
  let bad = false;
  for (const c of candidates) {
    const raw = values[key(c)] ?? "";
    const cents = parseCents(raw);
    if (raw.trim() !== "" && (cents === null || cents < 0)) bad = true;
    markets[key(c)] = cents === null || cents < 0 ? null : cents;
  }
  const plan = planClose(candidates, markets);
  const writtenDown = plan.lines.filter((l) => l.writedownCents > 0).length;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await closeYear({ year, markets });
      if (res.error) {
        setError(res.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <section className="card px-6 py-[22px]">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-0 max-w-[70ch]">
          <h2 className="disp text-[15px] font-bold">On hand at December 31, {year}</h2>
          <p className="mt-1.5 text-[13px] text-muted">
            Enter what each is worth now. Anything worth less than its cost is
            written down to that value, which becomes its cost from here on.
            Nothing is ever written up. Leave a value blank to keep it at cost.
          </p>
        </div>
      </div>

      {candidates.length === 0 ? (
        <p className="text-[13px] text-muted">Nothing was on hand at the end of {year}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-inset">
                <th className={`${th} pl-3`}>Item</th>
                <th className={`${th} text-right`}>Cost basis</th>
                <th className={`${th} w-[150px]`}>Market value</th>
                <th className={`${th} text-right`}>Write-down</th>
                <th className={`${th} pr-3 text-right`}>New basis</th>
              </tr>
            </thead>
            <tbody>
              {plan.lines.map((l) => (
                <tr key={key(l)}>
                  <td className={`${td} pl-3`}>
                    <span className="font-semibold">{l.name}</span>
                    {l.kind === "lot" && (
                      <span className="ml-2 rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold text-on-soft">
                        sealed lot
                      </span>
                    )}
                    <div className="cap mt-0.5">{l.locked ?? l.category}</div>
                  </td>
                  <td className={`${td} tnum text-right`}>{formatCents(l.basisCents)}</td>
                  <td className={td}>
                    <input
                      value={values[key(l)] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [key(l)]: e.target.value }))}
                      disabled={!!l.locked || !!blocked}
                      inputMode="decimal"
                      placeholder="At cost"
                      aria-label={`Market value of ${l.name}`}
                      className={`${field} tnum disabled:opacity-50`}
                    />
                  </td>
                  <td className={`${td} tnum text-right font-semibold ${l.writedownCents > 0 ? "text-neg" : "text-muted"}`}>
                    {l.writedownCents > 0 ? `−${formatCents(l.writedownCents)}` : "—"}
                  </td>
                  <td className={`${td} disp tnum pr-3 text-right font-bold`}>{formatCents(l.basisAfterCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-inset">
                <td className={`${td} pl-3 font-semibold`}>{plan.lines.length} on hand</td>
                <td className={`${td} tnum text-right font-semibold`}>{formatCents(plan.basisBeforeCents)}</td>
                <td className={td} />
                <td className={`${td} tnum text-right font-semibold text-neg`}>
                  {plan.writedownCents > 0 ? `−${formatCents(plan.writedownCents)}` : "—"}
                </td>
                <td className={`${td} disp tnum pr-3 text-right font-bold`}>{formatCents(plan.endingCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {blocked && <p className="mt-4 text-[13px] text-warn">{blocked}</p>}
      {bad && <p className="mt-4 text-sm text-warn">Some market values aren&rsquo;t valid amounts — they&rsquo;re kept at cost.</p>}

      <div className="mt-5">
        <button
          type="button"
          disabled={!!blocked || pending}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className={btnPrimary}
        >
          Close {year}…
        </button>
      </div>

      {confirming && (
        <div className={modalOverlay} role="dialog" aria-modal="true" aria-labelledby="close-confirm">
          <div className={modalPanel}>
            <h3 id="close-confirm" className="disp mb-2 text-lg font-bold">Close {year}?</h3>
            <p className="text-[13px] text-ink-2">
              Ending inventory of {formatCents(plan.endingCents)}
              {writtenDown > 0
                ? `, with ${writtenDown} item${writtenDown === 1 ? "" : "s"} written down by ${formatCents(plan.writedownCents)} in total. Their new cost is what future sales are measured against.`
                : ", with no write-downs."}{" "}
              The snapshot is saved; you can reopen the year later if you need to fix it.
            </p>
            {error && <p className="mt-3 text-sm text-neg">{error}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={submit} disabled={pending} className={btnPrimary}>
                {pending ? "Closing…" : `Close ${year}`}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={btnSecondary}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Reopen a closed year (reverses its write-downs, keeps the record). */
export function ReopenYear({ closeId, year }: { closeId: string; year: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnDanger}>
        Reopen {year}…
      </button>
      {open && (
        <div className={modalOverlay} role="dialog" aria-modal="true" aria-labelledby="reopen-title">
          <div className={modalPanel}>
            <h3 id="reopen-title" className="disp mb-2 text-lg font-bold">Reopen {year}?</h3>
            <p className="text-[13px] text-ink-2">
              Its write-downs are reversed, so those items go back to their
              earlier cost. This close stays in the history, marked reopened.
            </p>
            <label className="mt-4 block">
              <span className={fieldLabel}>Why? (kept in the history)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={field} />
            </label>
            {error && <p className="mt-3 text-sm text-neg">{error}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending || reason.trim() === ""}
                onClick={() =>
                  startTransition(async () => {
                    const res = await reopenYear(closeId, reason);
                    if (res.error) {
                      setError(res.error);
                      return;
                    }
                    setOpen(false);
                    router.refresh();
                  })
                }
                className={btnDanger}
              >
                {pending ? "Reopening…" : `Reopen ${year}`}
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className={btnSecondary}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
