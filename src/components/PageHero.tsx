import type { ReactNode } from "react";

// The pale panel at the top of each page: title and a line of explanation on
// the left, the page's headline figures in white wells on the right.
export type Stat = {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "warn";
};

const TONE: Record<NonNullable<Stat["tone"]>, string> = {
  pos: "text-pos",
  neg: "text-neg",
  warn: "text-warn",
};

export function StatWells({ stats }: { stats: Stat[] }) {
  return (
    <dl className="flex flex-wrap gap-2.5">
      {stats.map((s) => (
        <div
          key={s.label}
          className="min-w-[104px] flex-1 rounded-[14px] bg-surface px-[18px] py-[13px] sm:flex-none"
        >
          <dt className="cap">{s.label}</dt>
          <dd
            className={`disp tnum mt-[3px] text-[21px] font-bold ${
              s.tone ? TONE[s.tone] : ""
            }`}
          >
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function PageHero({
  title,
  description,
  stats,
  children,
}: {
  title: string;
  description?: ReactNode;
  stats?: Stat[];
  /** Extra line under the description, e.g. a "13 not listed" link. */
  children?: ReactNode;
}) {
  return (
    <section className="rounded-[22px] bg-panel px-[22px] py-[22px] sm:px-[26px]">
      <div className="flex flex-wrap items-end gap-6">
        <div className="min-w-0 max-w-[62ch]">
          <h1 className="disp text-[26px] font-bold leading-tight">{title}</h1>
          {description && (
            <p className="mt-1.5 text-[13px] text-panel-ink">{description}</p>
          )}
          {children}
        </div>
        {stats && stats.length > 0 && (
          <>
            <span className="hidden grow sm:block" />
            <StatWells stats={stats} />
          </>
        )}
      </div>
    </section>
  );
}
