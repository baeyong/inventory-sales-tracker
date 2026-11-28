import Link from "next/link";
import PageHero from "@/components/PageHero";
import YearPills, { pickYear, yearsOf } from "@/components/YearPills";
import CogsCsvButton from "@/components/CogsCsvButton";
import { requireUser } from "@/lib/supabase/requireUser";
import { loadTaxData } from "@/lib/taxData";
import { buildCogsReport } from "@/lib/cogs";
import { formatCents } from "@/lib/money";
import { cardTitle, td, toneClass } from "@/lib/ui";

export const metadata = { title: "COGS report · Resale Tracker" };

type Line = { label: string; cents: number; note?: string; sign?: "+" | "−" | "="; strong?: boolean };

function Lines({ rows }: { rows: Line[] }) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className={r.strong ? "bg-inset" : ""}>
            <td className={`${td} w-6 pl-3 text-muted`}>{r.sign ?? ""}</td>
            <td className={`${td} ${r.strong ? "font-bold" : ""}`}>
              {r.label}
              {r.note && <div className="cap mt-0.5 font-normal">{r.note}</div>}
            </td>
            <td className={`${td} disp tnum pr-3 text-right ${r.strong ? "text-[15px] font-bold" : "font-semibold"}`}>
              {formatCents(r.cents)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { supabase } = await requireUser();
  const data = await loadTaxData(supabase);

  const thisYear = new Date().getFullYear();
  const years = yearsOf(
    [
      ...data.items.flatMap((i) => [i.purchase_date, i.sale_date]),
      ...data.lots.map((l) => l.purchased_on),
    ],
    thisYear
  );
  const year = pickYear(params.year, years, years.includes(thisYear - 1) ? thisYear - 1 : thisYear);
  const r = buildCogsReport(data, year);

  return (
    <div className="flex flex-col gap-4">
      <YearPills href="/tax-report" years={years} active={year} />
      <PageHero
        title={`Cost of goods sold · ${year}`}
        description={
          <>
            The Schedule C Part III numbers for {year}, from your lots, items,
            year-end closes and Personal Collection moves.{" "}
            {!r.endingFromClose && (
              <Link href={`/year-end?year=${year}`} className="font-semibold underline">
                Close {year}
              </Link>
            )}
          </>
        }
        stats={[
          { label: "COGS", value: formatCents(r.cogsCents) },
          { label: "Gross profit", value: formatCents(r.grossProfitCents), tone: r.grossProfitCents >= 0 ? "pos" : "neg" },
          { label: "Net profit", value: formatCents(r.netProfitCents), tone: r.netProfitCents >= 0 ? "pos" : "neg" },
        ]}
      />

      {r.warnings.length > 0 && (
        <section className="rounded-[18px] bg-warn-surface px-[22px] py-[16px] text-[13px] text-warn">
          <ul className="list-disc space-y-1 pl-4">
            {r.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <section className="card px-6 py-[22px]">
          <h2 className={cardTitle}>Cost of goods sold</h2>
          <Lines
            rows={[
              {
                label: "Beginning inventory",
                cents: r.beginningCents,
                note: r.beginningFromClose ? `From the ${year - 1} close` : `At cost — ${year - 1} not closed`,
              },
              { sign: "+", label: "Purchases — items", cents: r.purchasesItemsCents },
              { sign: "+", label: "Purchases — lots", cents: r.purchasesLotsCents },
              { sign: "+", label: "Grading costs", cents: r.gradingCents, note: "Fees and shipping for cards sent in" },
              {
                sign: "−",
                label: "Withdrawals to Personal Collection",
                cents: r.withdrawalsCents,
                note: "Schedule C line 36 — not a deduction",
              },
              {
                sign: "−",
                label: "Ending inventory",
                cents: r.endingCents,
                note: r.endingFromClose ? "From the year-end close, after write-downs" : "At cost — not closed yet",
              },
              { sign: "=", label: "Cost of goods sold", cents: r.cogsCents, strong: true },
            ]}
          />
          <h3 className="cap mb-1 mt-5 px-3">Already inside COGS — shown for reference</h3>
          <Lines
            rows={[
              { label: "Year-end write-downs", cents: r.writedownsCents },
              { label: "Lots with nothing sellable", cents: r.lotLossesCents },
            ]}
          />
        </section>

        <section className="card px-6 py-[22px]">
          <h2 className={cardTitle}>Sales and profit</h2>
          <Lines
            rows={[
              { label: `Gross sales (${r.salesCount})`, cents: r.grossSalesCents },
              { sign: "−", label: "Fees", cents: r.feesCents },
              { sign: "−", label: "Shipping", cents: r.shippingCents },
              { sign: "=", label: "Net sales", cents: r.netSalesCents, strong: true },
              { sign: "−", label: "Cost of goods sold", cents: r.cogsCents },
              { sign: "=", label: "Gross profit", cents: r.grossProfitCents, strong: true },
              { sign: "−", label: "Expenses", cents: r.expensesCents },
              { sign: "=", label: "Net profit", cents: r.netProfitCents, strong: true },
            ]}
          />
          <p className="mt-4 px-3 text-xs text-muted">
            Cross-check: the cost basis of what sold comes to{" "}
            <span className={`tnum font-semibold ${toneClass(0)}`}>{formatCents(r.basisOfSoldCents)}</span>. It
            differs from COGS by write-downs, lot losses, bulk, and the change in inventory.
          </p>
        </section>
      </div>

      <section className="card flex flex-wrap items-center gap-3 px-6 py-[18px]">
        <div className="min-w-0 max-w-[70ch] text-[13px] text-ink-2">
          The CSV has all of the above plus every lot, every item held, bought
          or sold in {year} (original basis, write-downs, sale and gain/loss),
          each write-down and each transfer.
        </div>
        <span className="grow" />
        <CogsCsvButton report={r} />
      </section>
    </div>
  );
}
