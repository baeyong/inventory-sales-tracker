// A compact row of headline figures for the top of a list page. The value is
// large and bold so numbers stand out instead of blending into the prose; the
// label sits small and quiet beneath it.
export type Stat = {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "warn";
};

function toneClass(tone: Stat["tone"]): string {
  switch (tone) {
    case "pos":
      return "text-emerald-600 dark:text-emerald-400";
    case "neg":
      return "text-red-600 dark:text-red-400";
    case "warn":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-zinc-900 dark:text-zinc-100";
  }
}

export default function PageStats({ stats }: { stats: Stat[] }) {
  return (
    <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col">
          <dd className={`text-xl font-semibold leading-tight ${toneClass(s.tone)}`}>
            {s.value}
          </dd>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {s.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}
