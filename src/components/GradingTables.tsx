import Link from "next/link";
import {
  gainVsRaw,
  returnRate,
  type BreakdownRow,
  type MoneyTotals,
} from "@/lib/grading";
import { costBasis, formatMoney, type Item } from "@/lib/types";
import { cardTitle, signedMoney, td, th, toneClass } from "@/lib/ui";

// The money side of the Grading tab: where the money went and what came back.
// Sold results and the value of cards still held are always separate columns,
// so paper value never reads as cash made.

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

function Money({ n, signed = false }: { n: number; signed?: boolean }) {
  return (
    <span className={signed ? toneClass(n) : ""}>
      {signed ? signedMoney(n) : formatMoney(n)}
    </span>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card px-5 py-[18px]">
      <h3 className="cap">{title}</h3>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
      {note && <p className="mt-2.5 text-xs text-muted">{note}</p>}
    </section>
  );
}

function Line({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-ink-2">{label}</span>
      <span className={`tnum ${strong ? "disp text-[17px] font-bold" : ""}`}>{children}</span>
    </div>
  );
}

/** Spent / made / held / out, side by side. */
export function MoneyOverview({ t }: { t: MoneyTotals }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Panel title="Money in">
        <Line label="Cards">{formatMoney(t.cardCost)}</Line>
        <Line label="Grading fees">{formatMoney(t.fees)}</Line>
        <Line label={`Total · ${t.cards} cards`} strong>
          {formatMoney(t.spent)}
        </Line>
      </Panel>
      <Panel title="Sold" note={t.sold === 0 ? "No graded cards sold yet." : undefined}>
        <Line label={`Payouts · ${t.sold} sold`}>{formatMoney(t.revenue)}</Line>
        <Line label="Their cost">{formatMoney(t.soldCost)}</Line>
        <Line label="Profit" strong>
          <Money n={t.profit} signed />
        </Line>
        <Line label="Return">{pct(returnRate(t.profit, t.soldCost))}</Line>
      </Panel>
      <Panel title="Still holding" note="Estimated value, not cash.">
        <Line label={`Value · ${t.held} cards`}>{formatMoney(t.heldValue)}</Line>
        <Line label="Their cost">{formatMoney(t.heldCost)}</Line>
        <Line label="Paper profit" strong>
          <Money n={t.heldValue - t.heldCost} signed />
        </Line>
      </Panel>
      <Panel
        title="Added by grading"
        note={
          t.gainCount === 0
            ? "Needs a raw value on the graded cards."
            : "Graded value or sale, minus raw value and fee."
        }
      >
        <Line label={`Over ${t.gainCount} cards`} strong>
          <Money n={t.gainVsRaw} signed />
        </Line>
        <Line label="Per card">
          {t.gainCount === 0 ? "—" : <Money n={t.gainVsRaw / t.gainCount} signed />}
        </Line>
        <Line label="Fees paid">{formatMoney(t.fees)}</Line>
      </Panel>
    </div>
  );
}

/** One table of totals per group: by grade, by company, by set, by batch. */
export function BreakdownTable({
  title,
  description,
  rows,
  firstColumn,
  showShare = false,
}: {
  title: string;
  description?: string;
  rows: BreakdownRow[];
  firstColumn: string;
  /** Adds each group's share of the cards, e.g. the gem rate by grade. */
  showShare?: boolean;
}) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.cards, 0);
  const right = `${th} text-right`;
  const num = `${td} tnum text-right`;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className={`${cardTitle} !mb-0`}>{title}</h2>
        {description && <span className="text-[13px] text-muted">{description}</span>}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-inset">
                <th className={`${th} pl-5`}>{firstColumn}</th>
                <th className={right}>Cards</th>
                {showShare && <th className={right}>Share</th>}
                <th className={right}>Spent</th>
                <th className={right}>Fees</th>
                <th className={right}>Sold</th>
                <th className={right}>Payouts</th>
                <th className={right}>Profit</th>
                <th className={right}>Return</th>
                <th className={right}>Held value</th>
                <th className={`${right} pr-5`}>Added by grading</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className={`${td} pl-5 font-semibold`}>{r.label}</td>
                  <td className={num}>
                    {r.cards}
                    {r.out > 0 && <span className="text-muted"> ({r.out} out)</span>}
                  </td>
                  {showShare && <td className={num}>{pct(total > 0 ? r.cards / total : null)}</td>}
                  <td className={num}>{formatMoney(r.spent)}</td>
                  <td className={`${num} text-ink-2`}>{formatMoney(r.fees)}</td>
                  <td className={num}>{r.sold}</td>
                  <td className={num}>{r.sold > 0 ? formatMoney(r.revenue) : "—"}</td>
                  <td className={`${num} font-semibold`}>
                    {r.sold > 0 ? <Money n={r.profit} signed /> : "—"}
                  </td>
                  <td className={num}>{r.sold > 0 ? pct(returnRate(r.profit, r.soldCost)) : "—"}</td>
                  <td className={num}>{r.held > 0 ? formatMoney(r.heldValue) : "—"}</td>
                  <td className={`${num} pr-5`}>
                    {r.gainCount > 0 ? <Money n={r.gainVsRaw} signed /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** Every card that's back, with its own numbers. */
export function GradedCards({ items }: { items: Item[] }) {
  if (items.length === 0) return null;
  const right = `${th} text-right`;
  const num = `${td} tnum text-right`;
  const rows = [...items].sort((a, b) =>
    (b.grading_returned_at ?? "").localeCompare(a.grading_returned_at ?? "")
  );

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className={`${cardTitle} !mb-0`}>Graded cards</h2>
        <span className="text-[13px] text-muted">Newest back first</span>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-inset">
                <th className={`${th} pl-5`}>Card</th>
                <th className={th}>Grade</th>
                <th className={right}>Cost</th>
                <th className={right}>Fee</th>
                <th className={right}>Raw value</th>
                <th className={right}>Sold for / worth</th>
                <th className={right}>Added by grading</th>
                <th className={`${right} pr-5`}>Profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const sold = i.sale_date !== null && i.sale_payout !== null;
                const after = sold
                  ? Number(i.sale_payout)
                  : i.est_value === null
                    ? null
                    : Number(i.est_value);
                const gain = gainVsRaw(i);
                const profit = after === null ? null : after - costBasis(i);
                const raw = i.grade_values?.raw;
                return (
                  <tr key={i.id}>
                    <td className={`${td} pl-5`}>
                      <Link
                        href={`/inventory/${i.id}#grading`}
                        className="font-semibold hover:underline"
                      >
                        {i.name}
                      </Link>
                      {i.card_set && <div className="cap mt-0.5">{i.card_set}</div>}
                    </td>
                    <td className={`${td} whitespace-nowrap font-semibold`}>
                      {`${i.grade_company ?? ""} ${i.grade ?? ""}`.trim()}
                    </td>
                    <td className={`${num} text-ink-2`}>{formatMoney(Number(i.purchase_price))}</td>
                    <td className={`${num} text-ink-2`}>{formatMoney(Number(i.grading_cost ?? 0))}</td>
                    <td className={num}>{raw === undefined ? "—" : formatMoney(raw)}</td>
                    <td className={num}>
                      {after === null ? "—" : formatMoney(after)}
                      {sold && <span className="ml-1.5 text-[11px] font-semibold text-pos">sold</span>}
                    </td>
                    <td className={num}>{gain === null ? "—" : <Money n={gain} signed />}</td>
                    <td className={`${num} pr-5 font-semibold`}>
                      {profit === null ? (
                        "—"
                      ) : (
                        <span title={sold ? "Realized" : "On paper — not sold yet"}>
                          <Money n={profit} signed />
                          {!sold && <span className="ml-1 text-[11px] font-normal text-muted">paper</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
