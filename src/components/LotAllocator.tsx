"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { allocateLotAction } from "@/app/(app)/lots/actions";
import { allocateLot, allocationProblem, defaultSellable } from "@/lib/allocation";
import { formatCents, parseCents } from "@/lib/money";
import {
  btnDanger,
  btnPrimary,
  btnSecondary,
  btnSmall,
  btnText,
  cardTitle,
  field,
  fieldHint,
  fieldLabel,
  modalOverlay,
  modalPanel,
  td,
  th,
} from "@/lib/ui";

type Row = {
  key: string;
  itemId: string | null;
  name: string;
  value: string; // dollars, as typed
  sellable: boolean;
  /** Toggled by hand — stop following the threshold. */
  touched: boolean;
  /** Already sold (re-allocation only): its cost and profit will change. */
  sold?: boolean;
};

export type ExistingRow = {
  itemId: string;
  name: string;
  valueCents: number;
  sellable: boolean;
  sold: boolean;
};

const blank = (): Row => ({
  key: crypto.randomUUID(),
  itemId: null,
  name: "",
  value: "",
  sellable: true,
  touched: false,
});

/**
 * Open a lot, or re-allocate an opened one: list what came out, see the cost
 * split live, then confirm to lock it. The preview runs the same
 * allocateLot() the server saves with.
 */
export default function LotAllocator({
  lotId,
  basisCents,
  category,
  thresholdCents,
  mode,
  existing = [],
  bulkCount = 0,
  bulkNote = "",
  today,
}: {
  lotId: string;
  basisCents: number;
  category: string;
  thresholdCents: number;
  mode: "open" | "reallocate";
  existing?: ExistingRow[];
  bulkCount?: number;
  bulkNote?: string | null;
  today: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    mode === "open"
      ? [blank(), blank(), blank()]
      : existing.map((e) => ({
          key: e.itemId,
          itemId: e.itemId,
          name: e.name,
          value: (e.valueCents / 100).toFixed(2),
          sellable: e.sellable,
          touched: true,
          sold: e.sold,
        }))
  );
  const [openedOn, setOpenedOn] = useState(today);
  const [bulk, setBulk] = useState(String(bulkCount));
  const [note, setNote] = useState(bulkNote ?? "");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Blank new rows are ignored; bulk new rows are only counted.
  const live = rows.filter((r) => r.itemId !== null || r.name.trim() !== "" || r.value.trim() !== "");
  const kept = live.filter((r) => r.itemId !== null || r.sellable);
  const newBulk = live.length - kept.length;
  const bulkTotal = (Number.parseInt(bulk, 10) || 0) + newBulk;

  const preview = (() => {
    const inputs = kept.map((r) => ({
      key: r.key,
      valueCents: parseCents(r.value) ?? -1,
      sellable: r.sellable,
    }));
    if (inputs.some((i) => i.valueCents < 0)) {
      return { problem: "Give every item a market value (0 is fine for bulk).", alloc: null };
    }
    if (kept.some((r) => r.itemId === null && r.name.trim() === "")) {
      return { problem: "Give every item a name.", alloc: null };
    }
    const problem = allocationProblem(basisCents, inputs);
    if (problem) return { problem, alloc: null };
    return { problem: null, alloc: allocateLot(basisCents, inputs) };
  })();

  const costOf = new Map(preview.alloc?.lines.map((l) => [l.key, l.costCents]) ?? []);
  const soldTouched = rows.some((r) => r.sold);

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.value !== undefined && !next.touched) {
          const c = parseCents(next.value);
          if (c !== null) next.sellable = defaultSellable(c, thresholdCents);
        }
        return next;
      })
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await allocateLotAction(lotId, {
        opened_on: openedOn,
        reason: mode === "reallocate" ? reason : null,
        bulk_count: Number.parseInt(bulk, 10) || 0,
        bulk_note: note.trim() || null,
        rows: live.map((r) => ({
          item_id: r.itemId,
          name: r.name.trim(),
          category: r.itemId ? null : category,
          value_cents: parseCents(r.value) ?? 0,
          sellable: r.sellable,
        })),
      });
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
      <h2 className={cardTitle}>
        {mode === "open" ? "Open this lot" : "Re-allocate cost"}
      </h2>
      <p className="-mt-2 mb-4 max-w-[70ch] text-[13px] text-muted">
        {mode === "open" ? (
          <>
            List what you pulled with its market value from sold comps. Anything
            under {formatCents(thresholdCents)} starts as bulk: it costs $0 and
            only goes in the bulk count. The lot&rsquo;s{" "}
            {formatCents(basisCents)} is split across the sellable items by
            value, and once you confirm, those costs are locked.
          </>
        ) : (
          <>
            For fixing mistakes only. This rewrites the locked cost of every
            item from this lot, sold ones included, and is kept in the
            history below with your reason.
          </>
        )}
      </p>

      {mode === "open" && (
        <label className="mb-4 block max-w-[200px]">
          <span className={fieldLabel}>Opened on</span>
          <input
            type="date"
            value={openedOn}
            onChange={(e) => setOpenedOn(e.target.value)}
            className={`${field} tnum`}
          />
        </label>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-inset">
              <th className={`${th} pl-3`}>Item</th>
              <th className={`${th} w-[130px]`}>Market value</th>
              <th className={`${th} w-[150px]`}>Kind</th>
              <th className={`${th} w-[110px] text-right`}>Cost</th>
              <th className={`${th} w-[70px] text-right`}>Share</th>
              <th className={`${th} w-[40px]`}>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cost = costOf.get(r.key);
              const share =
                cost !== undefined && basisCents > 0 ? Math.round((cost / basisCents) * 100) : null;
              const dropped = r.itemId === null && !r.sellable;
              return (
                <tr key={r.key} className={dropped ? "opacity-60" : ""}>
                  <td className={`${td} pl-3`}>
                    {r.itemId ? (
                      <span className="font-semibold">
                        {r.name}
                        {r.sold && (
                          <span className="ml-2 rounded-full bg-warn-surface px-2 py-0.5 text-[11px] font-semibold text-warn">
                            sold
                          </span>
                        )}
                      </span>
                    ) : (
                      <input
                        value={r.name}
                        onChange={(e) => update(r.key, { name: e.target.value })}
                        placeholder="Charizard ex 199/165"
                        aria-label="Item name"
                        className={field}
                      />
                    )}
                  </td>
                  <td className={td}>
                    <input
                      value={r.value}
                      onChange={(e) => update(r.key, { value: e.target.value })}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label="Market value"
                      className={`${field} tnum`}
                    />
                  </td>
                  <td className={td}>
                    <div className="inline-flex rounded-full bg-inset p-0.5 text-xs" role="group" aria-label="Sellable or bulk">
                      {(["Sellable", "Bulk"] as const).map((label) => {
                        const on = (label === "Sellable") === r.sellable;
                        return (
                          <button
                            key={label}
                            type="button"
                            aria-pressed={on}
                            onClick={() => update(r.key, { sellable: label === "Sellable", touched: true })}
                            className={`rounded-full px-3 py-1.5 ${on ? "bg-ink font-semibold text-ground" : "text-ink-2"}`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className={`${td} disp tnum text-right font-bold`}>
                    {dropped ? (
                      <span className="text-[11px] font-medium text-muted">bulk count</span>
                    ) : cost === undefined ? (
                      "—"
                    ) : (
                      formatCents(cost)
                    )}
                  </td>
                  <td className={`${td} tnum text-right text-muted`}>
                    {share === null || dropped ? "" : `${share}%`}
                  </td>
                  <td className={td}>
                    {r.itemId === null && (
                      <button
                        type="button"
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        aria-label="Remove row"
                        className={btnText}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className={`${td} pl-3`} colSpan={3}>
                <button type="button" onClick={() => setRows((rs) => [...rs, blank()])} className={btnSmall}>
                  Add item
                </button>
              </td>
              <td className={`${td} disp tnum text-right font-bold`}>
                {preview.alloc
                  ? formatCents(preview.alloc.lines.reduce((s, l) => s + l.costCents, 0))
                  : "—"}
              </td>
              <td className={td} colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
        <label className="block">
          <span className={fieldLabel}>Bulk count</span>
          <input
            value={bulk}
            onChange={(e) => setBulk(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            className={`${field} tnum`}
          />
          {newBulk > 0 && (
            <span className={fieldHint}>
              +{newBulk} from the rows marked bulk = {bulkTotal}
            </span>
          )}
        </label>
        <label className="block">
          <span className={fieldLabel}>Bulk note</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Commons and energy, in the 800-count box"
            className={field}
          />
        </label>
      </div>

      {preview.problem && <p className="mt-4 text-sm text-warn">{preview.problem}</p>}
      {preview.alloc && preview.alloc.lossCents > 0 && (
        <p className="mt-4 rounded-[12px] bg-warn-surface px-4 py-3 text-[13px] text-warn">
          Nothing is sellable, so the whole {formatCents(preview.alloc.lossCents)} is
          recorded as a loss on the open date.
        </p>
      )}
      {error && !confirming && <p className="mt-4 text-sm text-neg">{error}</p>}

      <div className="mt-5">
        <button
          type="button"
          disabled={!preview.alloc || pending}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className={mode === "open" ? btnPrimary : btnDanger}
        >
          {mode === "open" ? "Review and lock costs" : "Re-allocate…"}
        </button>
      </div>

      {confirming && preview.alloc && (
        <div className={modalOverlay} role="dialog" aria-modal="true" aria-labelledby="alloc-confirm">
          <div className={modalPanel}>
            <h3 id="alloc-confirm" className="disp mb-2 text-lg font-bold">
              {mode === "open" ? "Lock these costs?" : "Re-allocate this lot?"}
            </h3>
            <p className="text-[13px] text-ink-2">
              {preview.alloc.lossCents > 0
                ? `${formatCents(preview.alloc.lossCents)} is recorded as a loss.`
                : `${formatCents(basisCents)} across ${kept.filter((r) => r.sellable).length} sellable item${kept.filter((r) => r.sellable).length === 1 ? "" : "s"}.`}{" "}
              {bulkTotal > 0 && `${bulkTotal} bulk at $0. `}
              {mode === "open"
                ? "Selling these later never changes each other's cost. Changing it means a logged re-allocation."
                : soldTouched
                  ? "Some of these are already sold — their cost and recorded profit will change."
                  : "Every item's cost is rewritten."}
            </p>
            {mode === "reallocate" && (
              <label className="mt-4 block">
                <span className={fieldLabel}>Why? (kept in the history)</span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Typed $60 instead of $6 for the Pikachu"
                  className={field}
                />
              </label>
            )}
            {error && <p className="mt-3 text-sm text-neg">{error}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={pending || (mode === "reallocate" && reason.trim() === "")}
                className={mode === "open" ? btnPrimary : btnDanger}
              >
                {pending ? "Saving…" : mode === "open" ? "Lock costs" : "Re-allocate"}
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
