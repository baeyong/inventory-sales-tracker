// A row of headline figures for the top of a list page, shown as bordered
// boxes like the dashboard tiles so the numbers stand out. On phones the boxes
// share the row; on larger screens they size to their content.
export type Stat = {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "warn";
};

function toneClass(tone: Stat["tone"]): string {
  switch (tone) {
    case "pos":
      return "text-pos";
    case "neg":
      return "text-neg";
    case "warn":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "";
  }
}

export default function PageStats({ stats }: { stats: Stat[] }) {
  return (
    <dl className="mt-3 flex flex-wrap gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="min-w-[140px] flex-1 rounded-xl border border-line bg-surface px-4 py-3 sm:flex-none"
        >
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            {s.label}
          </dt>
          <dd className={`mt-1 text-2xl font-semibold ${toneClass(s.tone)}`}>
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
