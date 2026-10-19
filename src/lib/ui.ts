// Shared class strings for the Sky design, so a button or field looks the same
// on every page. Plain strings rather than components: they slot into Link,
// button, a and label alike.

/** The filled accent pill — one per screen, for the main action. */
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-accent px-[18px] py-3 text-[13px] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50";

/** White pill with a soft shadow — secondary actions. */
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-surface px-4 py-2.5 text-[13px] font-medium text-ink shadow-pill hover:bg-inset disabled:opacity-50";

/** Smaller white pill, for footers and toolbars inside cards. */
export const btnSmall =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-xs font-semibold text-ink shadow-pill hover:bg-inset disabled:opacity-50";

/** Tinted square-ish button inside a table row. */
export const btnRow =
  "inline-flex items-center justify-center rounded-[9px] bg-inset px-3 py-2 text-xs font-semibold text-ink hover:bg-line disabled:opacity-50";

/** Destructive action, kept quiet until it's needed. */
export const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-full bg-surface px-4 py-2.5 text-[13px] font-semibold text-neg shadow-pill hover:bg-neg-surface disabled:opacity-50";

/** Text-only action, e.g. "Clear". */
export const btnText =
  "text-[13px] text-ink-2 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50";

/** Form field. */
export const field =
  "w-full rounded-[10px] border border-edge bg-surface px-3 py-2.5 text-[13px] text-ink placeholder:text-muted";

/** Label above a field. */
export const fieldLabel = "mb-1.5 block text-xs font-semibold text-ink-2";

/** Hint under a field. */
export const fieldHint = "mt-1.5 block text-xs text-muted";

/** Pill-shaped select used in toolbars. */
export const pillSelect =
  "rounded-full border-0 bg-surface py-2.5 pl-4 pr-8 text-xs font-medium text-ink-2 shadow-pill";

/** Heading inside a card. */
export const cardTitle = "disp mb-4 text-[15px] font-bold";

/** Table header cell. */
export const th =
  "px-3.5 py-3 text-left text-[11px] font-semibold tracking-[0.04em] text-muted";

/** Table body cell. */
export const td = "border-t border-line px-3.5 py-3.5";

/** Page-level empty state. */
export const emptyState =
  "card p-10 text-center text-sm text-muted";

/** The item screen's two columns: a wide form column and a narrower aside.
 * The page reuses it below the form for the sale and delete cards, so
 * everything lines up. */
export const detailGrid =
  "grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]";

/** Modal overlay and panel. */
export const modalOverlay =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4";
export const modalPanel = "card w-full max-w-md p-6 shadow-dock";

/** Money tone: green for gains, red for losses, muted when unknown. */
export function toneClass(n: number | null): string {
  if (n === null) return "text-muted";
  return n >= 0 ? "text-pos" : "text-neg";
}

/** A signed money figure, "+$12.00" / "-$3.50", as the mocks show profit. */
export function signedMoney(n: number): string {
  const s = Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  return `${n >= 0 ? "+" : "-"}${s}`;
}
