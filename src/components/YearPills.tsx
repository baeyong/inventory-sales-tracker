import Link from "next/link";

/** A row of year pills, like the section tabs, linking `${href}?year=`. */
export default function YearPills({
  href,
  years,
  active,
}: {
  href: string;
  years: number[];
  active: number;
}) {
  return (
    <nav
      aria-label="Tax year"
      className="flex max-w-full flex-wrap gap-1 self-start rounded-full bg-surface p-1 shadow-pill"
    >
      {years.map((y) => {
        const on = y === active;
        return (
          <Link
            key={y}
            href={`${href}?year=${y}`}
            aria-current={on ? "page" : undefined}
            className={`tnum rounded-full px-[13px] py-2 text-xs ${
              on ? "bg-ink font-semibold text-ground" : "font-medium text-ink-2 hover:bg-inset"
            }`}
          >
            {y}
          </Link>
        );
      })}
    </nav>
  );
}

/** Every year from the first record to this one, newest first. */
export function yearsOf(dates: (string | null | undefined)[], thisYear: number): number[] {
  let first = thisYear;
  for (const d of dates) {
    const y = d ? Number(d.slice(0, 4)) : NaN;
    if (Number.isFinite(y) && y >= 2000 && y < first) first = y;
  }
  return Array.from({ length: thisYear - first + 1 }, (_, i) => thisYear - i);
}

export function pickYear(param: string | string[] | undefined, years: number[], fallback: number): number {
  const y = Number(typeof param === "string" ? param : NaN);
  return years.includes(y) ? y : fallback;
}
