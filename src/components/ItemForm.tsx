"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createItem,
  updateItem,
  type FormState,
  type RippedBox,
} from "@/app/(app)/actions";
import {
  DEFAULT_CATEGORIES,
  GRADE_COMPANIES,
  costBasis,
  formatDate,
  formatMoney,
  isCardCategory,
  type CardCondition,
  type Item,
} from "@/lib/types";
import {
  PLATFORMS,
  PLATFORM_OPTIONS,
  autoQuery,
  defaultPlatformForCategory,
  marketLink,
} from "@/lib/market";
import { categoryHue } from "@/lib/categoryHue";
import {
  btnPrimary,
  btnSecondary,
  cardTitle,
  detailGrid,
  field,
  fieldHint,
  fieldLabel,
  signedMoney,
} from "@/lib/ui";

/** Where the item currently lives, for the chip in the header. */
function stateChip(item: Item): { label: string; cls: string } {
  if (item.sale_date) return { label: "Sold", cls: "bg-pos-surface text-pos" };
  if (item.opened_at) return { label: "Opened", cls: "bg-surface text-on-soft" };
  if (item.invested_at) return { label: "Investments", cls: "bg-hold-surface text-hold" };
  if (item.personal_at) return { label: "Collection", cls: "bg-keep-surface text-keep" };
  return { label: "In inventory", cls: "bg-surface text-on-soft" };
}

function cardSummary(item: Item): string | null {
  if (!isCardCategory(item.category)) return null;
  return (
    [
      item.card_set,
      item.card_number ? `#${item.card_number}` : null,
      item.condition === "graded"
        ? `${item.grade_company ?? ""} ${item.grade ?? ""}`.trim()
        : "Raw",
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
}

export default function ItemForm({
  item,
  categories = [],
  boxes = [],
  defaultRippedFrom = "",
}: {
  item?: Item;
  categories?: string[];
  boxes?: RippedBox[];
  /** Pre-picks the box when adding a pull from the Opened page. */
  defaultRippedFrom?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    item ? updateItem : createItem,
    null
  );
  const [category, setCategory] = useState<string>(item?.category ?? "");
  const [condition, setCondition] = useState<CardCondition>(
    item?.condition ?? "raw"
  );
  const [rippedFrom, setRippedFrom] = useState<string>(
    item?.ripped_from_id ?? defaultRippedFrom
  );
  const [marketPlatform, setMarketPlatform] = useState<string>(
    item?.market_platform ?? ""
  );
  const [marketSearch, setMarketSearch] = useState<string>(
    item?.market_search ?? ""
  );
  // After a failed submit the server echoes what was typed; prefer that over
  // the stored item so the form never loses the user's input.
  const v = state?.values;

  const isCard = isCardCategory(category);
  // When a card is pulled from a box, its cost is the box price split across
  // everything pulled from that box — so the price field is derived, not typed.
  const box = boxes.find((b) => b.id === rippedFrom) ?? null;
  const shareCount = box
    ? box.pulled + (item?.ripped_from_id === box.id ? 0 : 1)
    : 0;
  const share = box && shareCount > 0 ? box.purchase_price / shareCount : 0;
  // Live market link that reflects unsaved edits to platform/search/category.
  const marketPreview = item
    ? marketLink({
        ...item,
        category,
        market_platform: marketPlatform || null,
        market_search: marketSearch || null,
      })
    : null;
  const suggestions = [...DEFAULT_CATEGORIES, ...categories].filter(
    (c, i, all) =>
      all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i
  );
  // The box picker shows for cards, and whenever a box is already chosen.
  const showPicker = boxes.length > 0 && (isCard || rippedFrom !== "");

  const cost = item ? costBasis(item) : 0;
  const est = item?.est_value == null ? null : Number(item.est_value);
  const chip = item ? stateChip(item) : null;
  const summary = item ? cardSummary(item) : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      {item && (
        <>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="quantity" value={item.quantity} />
        </>
      )}

      {/* Head panel: identity, state and the primary actions together */}
      <section className="rounded-[22px] bg-panel px-[22px] py-[22px] sm:px-[26px]">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0">
            <h1 className="disp text-[26px] font-bold leading-tight">
              {item ? item.name : "Add item"}
            </h1>
            {item ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-[7px] rounded-full bg-surface px-[11px] py-[5px] text-[11px] font-semibold text-on-soft">
                  <span
                    className="h-2 w-2 rounded-[2px]"
                    style={{ background: categoryHue(item.category) }}
                  />
                  {item.category}
                </span>
                <span
                  className={`rounded-full px-[11px] py-[5px] text-[11px] font-semibold ${chip!.cls}`}
                >
                  {chip!.label}
                </span>
                {!item.sale_date && item.listed && (
                  <span className="rounded-full bg-pos-surface px-[11px] py-[5px] text-[11px] font-semibold text-pos">
                    Listed
                  </span>
                )}
                {summary && (
                  <span className="text-xs text-panel-ink">{summary}</span>
                )}
              </div>
            ) : (
              <p className="mt-1.5 text-[13px] text-panel-ink">
                Something you&rsquo;ve bought to sell, hold or keep.
              </p>
            )}
          </div>
          <span className="grow" />
          <div className="flex flex-wrap gap-2">
            {item && !item.sale_date && (
              <Link
                href={`/inventory/${item.id}/sell`}
                className={`${btnSecondary} !shadow-none`}
              >
                Mark sold
              </Link>
            )}
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? "Saving…" : item ? "Save changes" : "Add item"}
            </button>
          </div>
        </div>
        {state?.error && (
          <p className="mt-3 rounded-xl bg-surface px-3 py-2 text-[13px] text-neg">
            {state.error}
          </p>
        )}
      </section>

      <div className={detailGrid}>
        {/* Form column */}
        <div className="flex min-w-0 flex-col gap-3.5">
          <section className="card px-6 py-[22px]">
            <h2 className={cardTitle}>Item</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className={fieldLabel}>Name</span>
                <input
                  name="name"
                  required
                  defaultValue={v?.name ?? item?.name}
                  placeholder={isCard ? "2018 Luka Doncic Prizm #280" : "Item name"}
                  className={field}
                />
              </label>
              <label className={item ? "sm:col-span-2" : ""}>
                <span className={fieldLabel}>Category</span>
                <input
                  name="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  list="category-suggestions"
                  placeholder="General, Sneakers, your own…"
                  className={field}
                />
                <datalist id="category-suggestions">
                  {suggestions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <span className={fieldHint}>
                  Categories containing &ldquo;card&rdquo; get set, number and
                  grade fields.
                </span>
              </label>
              {!item && (
                <label>
                  <span className={fieldLabel}>Quantity</span>
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    step="1"
                    required
                    defaultValue={v?.quantity ?? 1}
                    className={`${field} tnum`}
                  />
                  <span className={fieldHint}>
                    More than 1 adds a separate entry each, splitting the cost.
                  </span>
                </label>
              )}
            </div>
            <label className="mt-4 inline-flex items-center gap-[9px] text-[13px]">
              <input
                type="checkbox"
                name="listed"
                defaultChecked={v ? v.listed === "on" : (item?.listed ?? false)}
                className="h-4 w-4 accent-[var(--pos)]"
              />
              Listed for sale
            </label>
          </section>

          {isCard && (
            <section className="card px-6 py-[22px]">
              <h2 className={cardTitle}>Card details</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="sm:col-span-2">
                  <span className={fieldLabel}>Set</span>
                  <input
                    name="card_set"
                    defaultValue={v?.card_set ?? item?.card_set ?? ""}
                    placeholder="2018-19 Panini Prizm"
                    className={field}
                  />
                </label>
                <label>
                  <span className={fieldLabel}>Card #</span>
                  <input
                    name="card_number"
                    defaultValue={v?.card_number ?? item?.card_number ?? ""}
                    placeholder="280"
                    className={`${field} tnum`}
                  />
                </label>
                <label>
                  <span className={fieldLabel}>Player / character</span>
                  <input
                    name="player"
                    defaultValue={v?.player ?? item?.player ?? ""}
                    placeholder="Luka Doncic"
                    className={field}
                  />
                </label>
                <label>
                  <span className={fieldLabel}>Condition</span>
                  <select
                    name="condition"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as CardCondition)}
                    className={field}
                  >
                    <option value="raw">Raw</option>
                    <option value="graded">Graded</option>
                  </select>
                </label>
                {condition === "graded" && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <label>
                      <span className={fieldLabel}>Grader</span>
                      <select
                        name="grade_company"
                        defaultValue={v?.grade_company ?? item?.grade_company ?? "PSA"}
                        className={field}
                      >
                        {GRADE_COMPANIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={fieldLabel}>Grade</span>
                      <input
                        name="grade"
                        defaultValue={v?.grade ?? item?.grade ?? ""}
                        placeholder="10"
                        className={`${field} tnum`}
                      />
                    </label>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="card px-6 py-[22px]">
            <h2 className={cardTitle}>Purchase</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {box ? (
                <div>
                  <span className={fieldLabel}>Cost</span>
                  <div className={`${field} tnum bg-inset text-ink-2`}>
                    {formatMoney(share)}
                  </div>
                  <input type="hidden" name="purchase_price" value={share.toFixed(2)} />
                  <span className={fieldHint}>Set by the box it came from.</span>
                </div>
              ) : (
                <label>
                  <span className={fieldLabel}>Cost (total)</span>
                  <input
                    name="purchase_price"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={v?.purchase_price ?? item?.purchase_price}
                    placeholder="0.00"
                    className={`${field} tnum`}
                  />
                </label>
              )}
              <label>
                <span className={fieldLabel}>Date</span>
                <input
                  name="purchase_date"
                  type="date"
                  defaultValue={v?.purchase_date ?? item?.purchase_date ?? ""}
                  className={`${field} tnum`}
                />
              </label>
              <label>
                <span className={fieldLabel}>Bought at</span>
                <input
                  name="purchase_platform"
                  defaultValue={v?.purchase_platform ?? item?.purchase_platform ?? ""}
                  placeholder="SNKRS, Target, eBay…"
                  className={field}
                />
              </label>
            </div>
          </section>

          <section className="card px-6 py-[22px]">
            <h2 className={cardTitle}>Notes</h2>
            <label>
              <span className="sr-only">Notes</span>
              <textarea
                name="description"
                rows={3}
                defaultValue={v?.description ?? item?.description ?? ""}
                className={`${field} resize-y`}
              />
            </label>
          </section>
        </div>

        {/* Aside */}
        <div className="flex min-w-0 flex-col gap-3.5">
          <section className="card px-6 py-[22px]">
            <h2 className={cardTitle}>{item ? "At a glance" : "Value"}</h2>
            {item && (
              <div className="mb-4 flex flex-col gap-2.5">
                <Glance label="Cost" value={formatMoney(cost)} />
                {item.sale_date ? (
                  <>
                    <Glance
                      label="Payout"
                      value={
                        item.sale_payout === null
                          ? "—"
                          : formatMoney(Number(item.sale_payout))
                      }
                    />
                    {item.sale_payout !== null && (
                      <Glance
                        label="Profit"
                        value={signedMoney(Number(item.sale_payout) - cost)}
                        tone={Number(item.sale_payout) - cost >= 0 ? "pos" : "neg"}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <Glance
                      label="Est. value"
                      value={est === null ? "—" : formatMoney(est)}
                    />
                    {est !== null && (
                      <Glance
                        label="Potential profit"
                        value={signedMoney(est - cost)}
                        tone={est - cost >= 0 ? "pos" : "neg"}
                      />
                    )}
                  </>
                )}
              </div>
            )}
            <label className="block">
              <span className={fieldLabel}>Your value</span>
              <input
                name="est_value"
                type="number"
                step="0.01"
                min="0"
                defaultValue={v?.est_value ?? item?.est_value ?? ""}
                placeholder="What it's worth now"
                className={`${field} tnum text-right`}
              />
              <span className={fieldHint}>
                Your own estimate from comps. Leave blank if you haven&rsquo;t
                valued it.
              </span>
            </label>
          </section>

          {item && (
            <section className="card px-6 py-[22px]">
              <h2 className={cardTitle}>Market lookup</h2>
              <div className="flex flex-col gap-3.5">
                <label>
                  <span className={fieldLabel}>Where to check</span>
                  <select
                    name="market_platform"
                    value={marketPlatform}
                    onChange={(e) => setMarketPlatform(e.target.value)}
                    className={field}
                  >
                    <option value="">
                      Category default (
                      {PLATFORMS[defaultPlatformForCategory(category)]?.label})
                    </option>
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={fieldLabel}>Search words</span>
                  <input
                    name="market_search"
                    value={marketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                    placeholder={autoQuery(item) || "item name"}
                    className={field}
                  />
                  <span className={fieldHint}>
                    Blank searches the item&rsquo;s own details. Paste a URL to
                    link anywhere.
                    {marketPlatform === "onethirtypoint" &&
                      " 130point opens its search tool — paste the query there."}
                  </span>
                </label>
                {marketPreview && (
                  <a
                    href={marketPreview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={btnPrimary}
                  >
                    Open {marketPreview.label}
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path
                        d="M4 2 L10 2 L10 8 M10 2 L2.5 9.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </a>
                )}
              </div>
            </section>
          )}

          {showPicker && (
            <section className="rounded-[18px] bg-panel px-6 py-[22px]">
              <h2 className={cardTitle}>Pulled from</h2>
              <label className="block">
                <span className="sr-only">Box this was pulled from</span>
                <select
                  name="ripped_from_id"
                  value={rippedFrom}
                  onChange={(e) => setRippedFrom(e.target.value)}
                  className={field}
                >
                  <option value="">Not pulled from a box</option>
                  {boxes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {formatDate(b.opened_at)} · {b.name} ·{" "}
                      {formatMoney(b.purchase_price)} · {b.pulled} pulled
                    </option>
                  ))}
                </select>
              </label>
              {box ? (
                <>
                  <p className="disp mt-3.5 text-sm font-bold">{box.name}</p>
                  <p className="mt-1 text-xs text-panel-ink">
                    Ripped <span className="tnum">{formatDate(box.opened_at)}</span> ·{" "}
                    <span className="tnum">{formatMoney(box.purchase_price)}</span> over{" "}
                    {shareCount} {shareCount === 1 ? "card" : "cards"}
                  </p>
                  <p className="mt-3 rounded-[10px] bg-surface px-3 py-2.5 text-xs text-panel-ink">
                    Cost is this box split evenly —{" "}
                    <span className="tnum font-semibold text-ink">
                      {formatMoney(share)}
                    </span>{" "}
                    a card. Pull another card and every share updates.
                  </p>
                </>
              ) : (
                <p className="mt-2.5 text-xs text-panel-ink">
                  Pick the sealed box you ripped this out of — newest rips
                  first — and its cost is shared across every card from it.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </form>
  );
}

function Glance({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  const bg = tone === "pos" ? "bg-pos-surface" : tone === "neg" ? "bg-neg-surface" : "bg-inset";
  const ink = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "";
  return (
    <div
      className={`flex items-baseline justify-between gap-3 rounded-xl px-3.5 py-3 ${bg}`}
    >
      <span className={tone ? `text-[11px] font-semibold tracking-[0.04em] ${ink}` : "cap"}>
        {label}
      </span>
      <span className={`disp tnum text-[19px] font-bold ${ink}`}>{value}</span>
    </div>
  );
}
