"use client";

import { useActionState, useState } from "react";
import { createItem, updateItem, type FormState } from "@/app/(app)/actions";
import {
  DEFAULT_CATEGORIES,
  GRADE_COMPANIES,
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

const inputCls =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export default function ItemForm({
  item,
  categories = [],
}: {
  item?: Item;
  categories?: string[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    item ? updateItem : createItem,
    null
  );
  const [category, setCategory] = useState<string>(item?.category ?? "");
  const [condition, setCondition] = useState<CardCondition>(
    item?.condition ?? "raw"
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

  return (
    <form action={action} className="max-w-2xl space-y-4">
      {item && (
        <>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="quantity" value={item.quantity} />
        </>
      )}

      <label className="block text-sm">
        <span className="font-medium">Category</span>
        <input
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          list="category-suggestions"
          placeholder="General, Sneakers, your own…"
          className={inputCls}
        />
        <datalist id="category-suggestions">
          {suggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <span className="mt-1 block text-xs text-zinc-500">
          Type anything — categories containing “card” get set/number/grade
          fields.
        </span>
      </label>

      <label className="block text-sm">
        <span className="font-medium">Name</span>
        <input
          name="name"
          required
          defaultValue={v?.name ?? item?.name}
          placeholder={
            isCard ? "2018 Luka Doncic Prizm #280" : "Item name"
          }
          className={inputCls}
        />
      </label>

      {isCard && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800">
          <label className="block text-sm">
            <span className="font-medium">Set</span>
            <input
              name="card_set"
              defaultValue={v?.card_set ?? item?.card_set ?? ""}
              placeholder="2018-19 Panini Prizm"
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Card #</span>
            <input
              name="card_number"
              defaultValue={v?.card_number ?? item?.card_number ?? ""}
              placeholder="280"
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Player / character</span>
            <input
              name="player"
              defaultValue={v?.player ?? item?.player ?? ""}
              placeholder="Luka Doncic"
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Condition</span>
            <select
              name="condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value as CardCondition)}
              className={inputCls}
            >
              <option value="raw">Raw</option>
              <option value="graded">Graded</option>
            </select>
          </label>
          {condition === "graded" && (
            <>
              <label className="block text-sm">
                <span className="font-medium">Grading company</span>
                <select
                  name="grade_company"
                  defaultValue={v?.grade_company ?? item?.grade_company ?? "PSA"}
                  className={inputCls}
                >
                  {GRADE_COMPANIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium">Grade</span>
                <input
                  name="grade"
                  defaultValue={v?.grade ?? item?.grade ?? ""}
                  placeholder="10, 9.5, …"
                  className={inputCls}
                />
              </label>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="font-medium">Purchase price (total)</span>
          <input
            name="purchase_price"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={v?.purchase_price ?? item?.purchase_price}
            placeholder="0.00"
            className={inputCls}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Purchase date</span>
          <input
            name="purchase_date"
            type="date"
            defaultValue={v?.purchase_date ?? item?.purchase_date ?? ""}
            className={inputCls}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Bought at</span>
          <input
            name="purchase_platform"
            defaultValue={v?.purchase_platform ?? item?.purchase_platform ?? ""}
            placeholder="SNKRS, Target, eBay…"
            className={inputCls}
          />
        </label>
        {!item && (
          <label className="block text-sm">
            <span className="font-medium">Quantity</span>
            <input
              name="quantity"
              type="number"
              min="1"
              step="1"
              required
              defaultValue={v?.quantity ?? 1}
              className={inputCls}
            />
            <span className="mt-1 block text-xs text-zinc-500">
              More than 1 adds a separate entry each, splitting the cost.
            </span>
          </label>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="listed"
          defaultChecked={v ? v.listed === "on" : (item?.listed ?? false)}
          className="h-4 w-4 accent-emerald-600"
        />
        <span className="font-medium">Listed for sale</span>
      </label>

      {item && (
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">Market value lookup</span>
            {marketPreview && (
              <a
                href={marketPreview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                Open {marketPreview.label} ↗
              </a>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Platform</span>
              <select
                name="market_platform"
                value={marketPlatform}
                onChange={(e) => setMarketPlatform(e.target.value)}
                className={inputCls}
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
            <label className="block text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">
                Search words or full URL
              </span>
              <input
                name="market_search"
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                placeholder={autoQuery(item) || "item name"}
                className={inputCls}
              />
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            Blank auto-searches from this item&apos;s details. Paste a full URL
            (e.g. an exact StockX page) to link straight there.
            {marketPreview && !marketPreview.custom && marketPreview.query && (
              <>
                {" "}
                · Searching:{" "}
                <span className="font-medium">{marketPreview.query}</span>
              </>
            )}
            {marketPlatform === "onethirtypoint" && (
              <> · 130point opens its search tool — paste the query there.</>
            )}
          </p>
        </div>
      )}

      <label className="block text-sm">
        <span className="font-medium">Notes</span>
        <textarea
          name="description"
          rows={2}
          defaultValue={v?.description ?? item?.description ?? ""}
          className={inputCls}
        />
      </label>

      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : item ? "Save changes" : "Add item"}
      </button>
    </form>
  );
}
