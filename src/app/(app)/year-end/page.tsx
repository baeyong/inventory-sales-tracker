import Link from "next/link";
import PageHero from "@/components/PageHero";
import YearPills, { pickYear, yearsOf } from "@/components/YearPills";
import YearEndClose, { ReopenYear } from "@/components/YearEndClose";
import { requireUser } from "@/lib/supabase/requireUser";
import { loadTaxData } from "@/lib/taxData";
import { inventoryAtYearEnd } from "@/lib/cogs";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/types";
import { cardTitle, td, th } from "@/lib/ui";

export const metadata = { title: "Year-end close · Resale Tracker" };

export default async function YearEndPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { supabase } = await requireUser();
  const data = await loadTaxData(supabase);

  const today = new Date().toISOString().slice(0, 10);
  const thisYear = Number(today.slice(0, 4));
  const years = yearsOf(
    [...data.items.map((i) => i.purchase_date), ...data.lots.map((l) => l.purchased_on)],
    thisYear
  );
  // The year you'd normally be closing is the one that just ended.
  const year = pickYear(params.year, years, years.includes(thisYear - 1) ? thisYear - 1 : thisYear);

  const live = data.closes.find((c) => c.tax_year === year && !c.reopened_at) ?? null;
  const reopened = data.closes
    .filter((c) => c.tax_year === year && c.reopened_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const laterClosed = data.closes.some((c) => c.tax_year > year && !c.reopened_at);

  const blocked =
    today <= `${year}-12-31`
      ? `${year} isn't over yet — you can close it from January 1, ${year + 1}.`
      : laterClosed
        ? `A later year is already closed. Reopen it first to close ${year}.`
        : null;

  return (
    <div className="flex flex-col gap-4">
      <YearPills href="/year-end" years={years} active={year} />
      <PageHero
        title={`Year-end close · ${year}`}
        description={
          <>
            Values your ending inventory at the lower of cost or market. Close
            each year once, in order; the result feeds the{" "}
            <Link href={`/tax-report?year=${year}`} className="font-semibold underline">
              COGS report
            </Link>
            . Check with your tax preparer that this inventory method suits you.
          </>
        }
        stats={
          live
            ? [
                { label: "Ending inventory", value: formatCents(live.ending_cents) },
                { label: "Write-downs", value: formatCents(live.writedown_cents), tone: live.writedown_cents > 0 ? "neg" : undefined },
                { label: "Closed", value: formatDate(live.closed_on) },
              ]
            : undefined
        }
      />

      {live ? (
        <section className="card px-6 py-[22px]">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="disp text-[15px] font-bold">Snapshot saved {formatDate(live.closed_on)}</h2>
            <span className="grow" />
            {!laterClosed && <ReopenYear closeId={live.id} year={year} />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="bg-inset">
                  <th className={`${th} pl-3`}>Item</th>
                  <th className={`${th} text-right`}>Cost basis</th>
                  <th className={`${th} text-right`}>Market</th>
                  <th className={`${th} text-right`}>Write-down</th>
                  <th className={`${th} pr-3 text-right`}>Ending basis</th>
                </tr>
              </thead>
              <tbody>
                {data.closeLines
                  .filter((l) => l.close_id === live.id)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((l) => (
                    <tr key={l.id}>
                      <td className={`${td} pl-3`}>
                        {l.item_id ? (
                          <Link href={`/inventory/${l.item_id}`} className="font-semibold hover:underline">{l.name}</Link>
                        ) : l.lot_id ? (
                          <Link href={`/lots/${l.lot_id}`} className="font-semibold hover:underline">{l.name}</Link>
                        ) : (
                          <span className="font-semibold">{l.name}</span>
                        )}
                        {l.kind === "lot" && <span className="cap ml-2">sealed lot</span>}
                      </td>
                      <td className={`${td} tnum text-right`}>{formatCents(l.basis_before_cents)}</td>
                      <td className={`${td} tnum text-right text-ink-2`}>{formatCents(l.market_cents)}</td>
                      <td className={`${td} tnum text-right font-semibold ${l.writedown_cents > 0 ? "text-neg" : "text-muted"}`}>
                        {l.writedown_cents > 0 ? `−${formatCents(l.writedown_cents)}` : "—"}
                      </td>
                      <td className={`${td} disp tnum pr-3 text-right font-bold`}>{formatCents(l.basis_after_cents)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <YearEndClose year={year} candidates={inventoryAtYearEnd(data, year)} blocked={blocked} />
      )}

      {reopened.length > 0 && (
        <section className="card px-6 py-[22px]">
          <h2 className={cardTitle}>Earlier closes of {year}</h2>
          <ul className="space-y-2 text-[13px]">
            {reopened.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-x-3">
                <span className="tnum text-ink-2">Closed {formatDate(c.closed_on)}</span>
                <span className="tnum">ending {formatCents(c.ending_cents)}, write-downs {formatCents(c.writedown_cents)}</span>
                <span className="text-muted">reopened {formatDate(c.reopened_at!.slice(0, 10))}: “{c.reopen_reason}”</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
