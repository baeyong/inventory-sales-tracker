"use client";

import { useActionState, useState } from "react";
import { createLot, updateLot, type LotFormState } from "@/app/(app)/lots/actions";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_CATEGORIES, PLATFORM_SUGGESTIONS, type Lot } from "@/lib/types";
import { formatCents } from "@/lib/money";
import { btnPrimary, btnText, field, fieldHint, fieldLabel } from "@/lib/ui";

const dollars = (c: number | null | undefined) =>
  c === null || c === undefined ? "" : (c / 100).toFixed(2);

/** New lot, or edit one. Once a lot is opened its cost and date are locked
 * (they're what the allocation was built on), so only the details change. */
export default function LotForm({
  lot,
  userId,
  categories,
  receiptLink,
}: {
  lot?: Lot;
  userId: string;
  categories: string[];
  receiptLink?: string | null;
}) {
  const [state, action, pending] = useActionState<LotFormState, FormData>(
    lot ? updateLot : createLot,
    null
  );
  const v = state?.values;
  const locked = !!lot?.opened_on;

  const [receiptPath, setReceiptPath] = useState<string>(
    v?.receipt_path ?? lot?.receipt_path ?? ""
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `${userId}/${crypto.randomUUID()}-${safe}`;
      const { error } = await createClient().storage.from("receipts").upload(path, file, {
        contentType: file.type || undefined,
      });
      if (error) throw new Error(error.message);
      setReceiptPath(path);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const suggestions = [...DEFAULT_CATEGORIES, ...categories].filter(
    (c, i, all) => all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i
  );

  return (
    <form action={action} className="card max-w-3xl space-y-4 px-6 py-[22px]">
      {lot && <input type="hidden" name="id" value={lot.id} />}
      <input type="hidden" name="receipt_path" value={receiptPath} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="block">
          <span className={fieldLabel}>Name</span>
          <input
            name="name"
            required
            defaultValue={v?.name ?? lot?.name}
            placeholder="Surging Sparks booster box"
            className={field}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>Category for what&rsquo;s pulled</span>
          <input
            name="category"
            list="lot-categories"
            defaultValue={v?.category ?? lot?.category ?? "Pokémon Cards"}
            className={field}
          />
          <datalist id="lot-categories">
            {suggestions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {locked ? (
          <>
            <div>
              <span className={fieldLabel}>Total cost</span>
              <div className={`${field} tnum bg-inset text-ink-2`}>{formatCents(lot!.total_cost_cents)}</div>
              <input type="hidden" name="total_cost" value={dollars(lot!.total_cost_cents)} />
              <span className={fieldHint}>Locked: it&rsquo;s been allocated.</span>
            </div>
            <div>
              <span className={fieldLabel}>Purchased</span>
              <div className={`${field} tnum bg-inset text-ink-2`}>{lot!.purchased_on}</div>
              <input type="hidden" name="purchased_on" value={lot!.purchased_on} />
            </div>
          </>
        ) : (
          <>
            <label className="block">
              <span className={fieldLabel}>Total cost</span>
              <input
                name="total_cost"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={v?.total_cost ?? dollars(lot?.total_cost_cents)}
                placeholder="0.00"
                className={`${field} tnum`}
              />
              <span className={fieldHint}>All-in: price + tax + shipping.</span>
            </label>
            <label className="block">
              <span className={fieldLabel}>Purchased</span>
              <input
                name="purchased_on"
                type="date"
                required
                defaultValue={v?.purchased_on ?? lot?.purchased_on ?? new Date().toISOString().slice(0, 10)}
                className={`${field} tnum`}
              />
            </label>
          </>
        )}
        <label className="block">
          <span className={fieldLabel}>Bought at</span>
          <input
            name="purchase_platform"
            list="lot-platforms"
            defaultValue={v?.purchase_platform ?? lot?.purchase_platform ?? ""}
            placeholder="Target, card show…"
            className={field}
          />
          <datalist id="lot-platforms">
            {PLATFORM_SUGGESTIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
      </div>

      {!locked && (
        <label className="block max-w-[220px]">
          <span className={fieldLabel}>Market value (sealed)</span>
          <input
            name="est_value"
            type="number"
            step="0.01"
            min="0"
            defaultValue={v?.est_value ?? dollars(lot?.est_value_cents)}
            placeholder="Optional"
            className={`${field} tnum`}
          />
          <span className={fieldHint}>Pre-fills the year-end close.</span>
        </label>
      )}

      <label className="block">
        <span className={fieldLabel}>Notes</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={v?.notes ?? lot?.notes ?? ""}
          className={field}
        />
      </label>

      <div>
        <span className={fieldLabel}>Receipt</span>
        {receiptPath ? (
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            {receiptLink && receiptPath === lot?.receipt_path ? (
              <a href={receiptLink} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                View receipt
              </a>
            ) : (
              <span className="text-ink-2">Uploaded — saves with the lot.</span>
            )}
            <button type="button" onClick={() => setReceiptPath("")} className={btnText}>
              Remove
            </button>
          </div>
        ) : (
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
            className="block text-[13px] text-ink-2 file:mr-3 file:rounded-full file:border-0 file:bg-surface file:px-4 file:py-2 file:text-xs file:font-semibold file:text-ink file:shadow-pill"
          />
        )}
        <span className={fieldHint}>
          {uploading ? "Uploading…" : "Optional. Photo or PDF, up to 10 MB. Private to you."}
        </span>
        {uploadError && <p className="mt-1 text-sm text-neg">{uploadError}</p>}
      </div>

      {state?.error && <p className="text-sm text-neg">{state.error}</p>}
      {state?.notice && <p className="text-sm text-pos">{state.notice}</p>}

      <button type="submit" disabled={pending || uploading} className={btnPrimary}>
        {pending ? "Saving…" : lot ? "Save changes" : "Add lot"}
      </button>
    </form>
  );
}
