export type BundleColor = { stripe: string; dot: string; badge: string };

// Distinct hues cycled across bundles. Each entry pairs a left-edge stripe,
// a badge fill, and a dot so a bundle reads the same everywhere it appears.
// All class strings are static so Tailwind keeps them in the build.
export const BUNDLE_COLORS: readonly BundleColor[] = [
  { stripe: "border-l-amber-500", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  { stripe: "border-l-sky-500", dot: "bg-sky-500", badge: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  { stripe: "border-l-violet-500", dot: "bg-violet-500", badge: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  { stripe: "border-l-emerald-500", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  { stripe: "border-l-rose-500", dot: "bg-rose-500", badge: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" },
  { stripe: "border-l-teal-500", dot: "bg-teal-500", badge: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" },
  { stripe: "border-l-indigo-500", dot: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" },
  { stripe: "border-l-fuchsia-500", dot: "bg-fuchsia-500", badge: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300" },
] as const;

export type BundleMeta = { num: number; color: BundleColor };

/** Turn the canonical bundle numbering (bundle_id → number, from
 * getBundleNumbers) into per-bundle display metadata. Shared by every page so
 * a bundle looks identical wherever it appears. */
export function buildBundleMeta(
  bundleNumbers: Record<string, number>
): Map<string, BundleMeta> {
  const meta = new Map<string, BundleMeta>();
  for (const [bundleId, num] of Object.entries(bundleNumbers)) {
    meta.set(bundleId, {
      num,
      color: BUNDLE_COLORS[(num - 1) % BUNDLE_COLORS.length],
    });
  }
  return meta;
}

/** Reorder an already-sorted list so each bundle's members sit contiguously,
 * anchored at the position of the bundle's first item in that order. */
export function groupBundles<
  T extends { id: string; bundle_id: string | null },
>(ordered: T[], meta: Map<string, BundleMeta>): T[] {
  const out: T[] = [];
  const done = new Set<string>();
  for (const it of ordered) {
    if (done.has(it.id)) continue;
    if (it.bundle_id && meta.has(it.bundle_id)) {
      for (const m of ordered) {
        if (m.bundle_id === it.bundle_id && !done.has(m.id)) {
          out.push(m);
          done.add(m.id);
        }
      }
    } else {
      out.push(it);
      done.add(it.id);
    }
  }
  return out;
}
