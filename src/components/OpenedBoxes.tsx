"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkMarkUnopened } from "@/app/(app)/actions";
import { formatDate, formatMoney, type Item } from "@/lib/types";
import { matchesSearch } from "@/lib/search";
import { btnSmall, btnText, emptyState, signedMoney, toneClass } from "@/lib/ui";
import { SearchCount, SearchField, ToolbarRow } from "@/components/Toolbar";

/** Where a pulled card is now, as a coloured chip. */
function where(item: Item): { label: string; cls: string } {
  if (item.sale_date) return { label: "Sold", cls: "bg-pos-surface text-pos" };
  if (item.invested_at) return { label: "Investments", cls: "bg-hold-surface text-hold" };
  if (item.personal_at) return { label: "Collection", cls: "bg-keep-surface text-keep" };
  if (item.opened_at) return { label: "Opened", cls: "bg-inset text-ink-2" };
  return { label: "Inventory", cls: "bg-soft text-on-soft" };
}

/** What a pull is worth: its payout once sold, otherwise your estimate. */
function worth(item: Item): number | null {
  if (item.sale_date) return item.sale_payout === null ? null : Number(item.sale_payout);
  return item.est_value === null ? null : Number(item.est_value);
}

function pullDetail(item: Item): string | null {
  if (!item.card_set && !item.condition) return null;
  return item.condition === "graded"
    ? `${item.grade_company ?? ""} ${item.grade ?? ""}`.trim()
    : "Raw";
}

function BoxIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
      <path
        d="M2 5 L8.5 2 L15 5 L15 12 L8.5 15 L2 12 Z M2 5 L8.5 8 L15 5 M8.5 8 L8.5 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Ripped boxes, each with the cards pulled from it. A box's cost is split
 * evenly across its pulls, so the footer weighs what they're worth against it. */
export default function OpenedBoxes({
  boxes,
  pulls,
}: {
  boxes: Item[];
  pulls: Item[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pullsOf = new Map<string, Item[]>();
  for (const p of pulls) {
    const arr = pullsOf.get(p.ripped_from_id!) ?? [];
    arr.push(p);
    pullsOf.set(p.ripped_from_id!, arr);
  }

  // A box matches on its own details or on any card pulled from it.
  const visible = boxes.filter(
    (b) =>
      matchesSearch(b, search) ||
      (pullsOf.get(b.id) ?? []).some((p) => matchesSearch(p, search))
  );

  function moveBack(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await bulkMarkUnopened([id]);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ToolbarRow>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search boxes and pulls…"
        />
        {search && (
          <SearchCount
            shown={visible.length}
            total={boxes.length}
            onClear={() => setSearch("")}
          />
        )}
        {error && <span className="text-sm text-neg">{error}</span>}
      </ToolbarRow>

      {boxes.length === 0 && (
        <div className={emptyState}>
          Nothing opened yet. In{" "}
          <Link href="/inventory" className="text-accent hover:underline">
            Inventory
          </Link>
          , select a sealed item and choose{" "}
          <span className="font-medium">Rip open</span>.
        </div>
      )}

      {visible.map((box) => {
        const its = pullsOf.get(box.id) ?? [];
        const cost = Number(box.purchase_price);
        const share = its.length > 0 ? cost / its.length : null;
        const valued = its.map(worth).filter((v): v is number => v !== null);
        const pullValue = valued.reduce((s, v) => s + v, 0);
        const delta = pullValue - cost;
        return (
          <article key={box.id} className="card overflow-hidden">
            <header className="flex flex-wrap items-center gap-3.5 bg-panel px-5 py-[15px]">
              <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-surface text-on-soft">
                <BoxIcon />
              </span>
              <div className="min-w-0">
                <Link
                  href={`/inventory/${box.id}`}
                  className="disp text-base font-bold hover:underline"
                >
                  {box.name}
                </Link>
                <div className="mt-0.5 text-xs text-panel-ink">
                  Ripped <span className="tnum">{formatDate(box.opened_at)}</span>
                  {box.purchase_platform && <> · bought at {box.purchase_platform}</>}
                  {" · "}
                  <span className="tnum">{formatMoney(cost)}</span>
                </div>
              </div>
              <span className="grow" />
              <div className="rounded-[13px] bg-surface px-[15px] py-2.5 text-right">
                <div className="disp tnum text-[17px] font-bold">
                  {share === null ? "—" : formatMoney(share)}
                </div>
                <div className="cap mt-px">
                  a card · <span className="tnum">{its.length}</span> pulled
                </div>
              </div>
            </header>

            {its.length === 0 ? (
              <p className="px-5 py-5 text-[13px] text-muted">
                No pulls recorded from this box yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-[13px]">
                  <thead>
                    <tr>
                      <th className="cap py-[11px] pl-5 pr-3.5 text-left">Pulled</th>
                      <th className="cap px-3.5 py-[11px] text-right">Cost share</th>
                      <th className="cap px-3.5 py-[11px] text-right">Value</th>
                      <th className="cap py-[11px] pl-3.5 pr-5 text-left">Where it is</th>
                    </tr>
                  </thead>
                  <tbody>
                    {its.map((p) => {
                      const w = where(p);
                      const v = worth(p);
                      const detail = pullDetail(p);
                      return (
                        <tr key={p.id}>
                          <td className="border-t border-line py-3 pl-5 pr-3.5">
                            <Link
                              href={`/inventory/${p.id}`}
                              className="font-semibold hover:underline"
                            >
                              {p.name}
                            </Link>
                            {detail && <span className="cap ml-2">{detail}</span>}
                          </td>
                          <td className="tnum border-t border-line px-3.5 py-3 text-right text-ink-2">
                            {formatMoney(Number(p.purchase_price))}
                          </td>
                          <td className="disp tnum border-t border-line px-3.5 py-3 text-right text-[15px] font-bold">
                            {v === null ? <span className="text-muted">—</span> : formatMoney(v)}
                          </td>
                          <td className="border-t border-line py-3 pl-3.5 pr-5">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${w.cls}`}
                            >
                              {w.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <footer className="flex flex-wrap items-center gap-3.5 bg-inset px-5 py-[13px]">
              <Link href={`/inventory/new?from=${box.id}`} className={btnSmall}>
                Add a pull
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={() => moveBack(box.id)}
                title="Move back to inventory (unopened)"
                className={`${btnText} !text-xs underline`}
              >
                Back to inventory
              </button>
              <span className="grow" />
              {valued.length > 0 && (
                <>
                  <span className="cap">
                    Pulls worth{" "}
                    <span className="tnum text-ink">{formatMoney(pullValue)}</span>{" "}
                    against <span className="tnum">{formatMoney(cost)}</span> in
                  </span>
                  <span className={`disp tnum text-[15px] font-bold ${toneClass(delta)}`}>
                    {signedMoney(delta)}
                  </span>
                </>
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
