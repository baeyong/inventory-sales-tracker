"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/requireUser";
import { allocateLot, allocationProblem, DEFAULT_BULK_THRESHOLD_CENTS } from "@/lib/allocation";
import { parseCents } from "@/lib/money";
import type { Lot } from "@/lib/types";

export type LotFormState = {
  error?: string;
  notice?: string;
  values?: Record<string, string>;
} | null;

function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const optionalText = z
  .string()
  .nullable()
  .transform((s) => {
    const t = (s ?? "").trim();
    return t === "" ? null : t;
  });

function revalidateLots(id?: string) {
  revalidatePath("/lots");
  if (id) revalidatePath(`/lots/${id}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Bulk threshold

export async function getBulkThresholdCents(): Promise<number> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("user_settings")
    .select("bulk_threshold_cents")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Number(data.bulk_threshold_cents) : DEFAULT_BULK_THRESHOLD_CENTS;
}

export async function saveBulkThreshold(
  _prev: LotFormState,
  formData: FormData
): Promise<LotFormState> {
  const { supabase, user } = await requireUser();
  const cents = parseCents(String(formData.get("bulk_threshold") ?? ""));
  if (cents === null || cents < 0) {
    return { error: "Enter a dollar amount, 0 or more.", values: formValues(formData) };
  }
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, bulk_threshold_cents: cents }, { onConflict: "user_id" });
  if (error) return { error: error.message, values: formValues(formData) };
  revalidatePath("/lots");
  return { notice: "Saved." };
}

// ---------------------------------------------------------------------------
// Create / edit / delete

const lotSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: z
    .string()
    .nullable()
    .transform((s) => (s ?? "").trim() || "General"),
  purchased_on: isoDate,
  purchase_platform: optionalText,
  total_cost: z
    .string()
    .nullable()
    .transform((s, ctx) => {
      const c = parseCents(s);
      if (c === null || c < 0) {
        ctx.addIssue({ code: "custom", message: "Enter the total cost, 0 or more" });
        return z.NEVER;
      }
      return c;
    }),
  est_value: z
    .string()
    .nullable()
    .transform((s, ctx) => {
      if ((s ?? "").trim() === "") return null;
      const c = parseCents(s);
      if (c === null || c < 0) {
        ctx.addIssue({ code: "custom", message: "Enter a valid estimate" });
        return z.NEVER;
      }
      return c;
    }),
  notes: optionalText,
  receipt_path: optionalText,
});

function lotPayload(formData: FormData) {
  return lotSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    purchased_on: formData.get("purchased_on"),
    purchase_platform: formData.get("purchase_platform"),
    total_cost: formData.get("total_cost"),
    est_value: formData.get("est_value"),
    notes: formData.get("notes"),
    receipt_path: formData.get("receipt_path"),
  });
}

/** Receipts live under the uploader's own folder; refuse anything else. */
function receiptOk(path: string | null, userId: string): boolean {
  return path === null || (path.startsWith(`${userId}/`) && !path.includes(".."));
}

export async function createLot(
  _prev: LotFormState,
  formData: FormData
): Promise<LotFormState> {
  const { supabase, user } = await requireUser();
  const parsed = lotPayload(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid lot.", values: formValues(formData) };
  }
  const d = parsed.data;
  if (!receiptOk(d.receipt_path, user.id)) {
    return { error: "That receipt upload isn't yours.", values: formValues(formData) };
  }

  const { data, error } = await supabase
    .from("lots")
    .insert({
      user_id: user.id,
      name: d.name,
      category: d.category,
      purchased_on: d.purchased_on,
      purchase_platform: d.purchase_platform,
      total_cost_cents: d.total_cost,
      est_value_cents: d.est_value,
      notes: d.notes,
      receipt_path: d.receipt_path,
    })
    .select("id")
    .single();
  if (error) return { error: error.message, values: formValues(formData) };

  revalidateLots();
  redirect(`/lots/${data.id}`);
}

/** Once a lot is opened its cost and purchase date are part of the locked
 * allocation, so only the descriptive fields can change. */
export async function updateLot(
  _prev: LotFormState,
  formData: FormData
): Promise<LotFormState> {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const parsed = lotPayload(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid lot.", values: formValues(formData) };
  }
  const d = parsed.data;
  if (!receiptOk(d.receipt_path, user.id)) {
    return { error: "That receipt upload isn't yours.", values: formValues(formData) };
  }

  const { data: cur, error: readError } = await supabase
    .from("lots")
    .select("opened_on, receipt_path, writedown_cents")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return { error: readError.message, values: formValues(formData) };
  if (!cur) return { error: "Lot not found.", values: formValues(formData) };
  if (!cur.opened_on && d.total_cost < Number(cur.writedown_cents)) {
    return {
      error: "The cost can't go below what's already been written down at year end.",
      values: formValues(formData),
    };
  }

  const patch = cur.opened_on
    ? {
        name: d.name,
        category: d.category,
        purchase_platform: d.purchase_platform,
        notes: d.notes,
        receipt_path: d.receipt_path,
      }
    : {
        name: d.name,
        category: d.category,
        purchased_on: d.purchased_on,
        purchase_platform: d.purchase_platform,
        total_cost_cents: d.total_cost,
        est_value_cents: d.est_value,
        notes: d.notes,
        receipt_path: d.receipt_path,
      };

  const { error } = await supabase.from("lots").update(patch).eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message, values: formValues(formData) };

  // A replaced or removed receipt shouldn't linger in storage.
  if (cur.receipt_path && cur.receipt_path !== d.receipt_path) {
    await supabase.storage.from("receipts").remove([cur.receipt_path]);
  }

  revalidateLots(id);
  return { notice: "Saved." };
}

/** Only an unopened lot can be deleted — an opened one is the record behind
 * its items' locked costs. */
export async function deleteLot(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") ?? "");

  const { data: lot } = await supabase
    .from("lots")
    .select("opened_on, receipt_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!lot || lot.opened_on) redirect(`/lots/${id}`);

  const { error } = await supabase.from("lots").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  if (lot.receipt_path) await supabase.storage.from("receipts").remove([lot.receipt_path]);

  revalidateLots();
  redirect("/lots");
}

/** A short-lived link to view a lot's receipt. */
export async function receiptUrl(path: string): Promise<string | null> {
  const { supabase, user } = await requireUser();
  if (!receiptOk(path, user.id)) return null;
  const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

// ---------------------------------------------------------------------------
// Open / re-allocate

const rowSchema = z.object({
  item_id: z.string().uuid().nullable(),
  name: z.string().trim().max(200),
  category: z.string().trim().max(60).nullable(),
  value_cents: z.number().int().min(0),
  sellable: z.boolean(),
});

const allocateSchema = z.object({
  opened_on: isoDate,
  reason: z.string().trim().max(500).nullable(),
  bulk_count: z.number().int().min(0).max(1_000_000),
  bulk_note: z.string().trim().max(500).nullable(),
  rows: z.array(rowSchema).max(500),
});

export type AllocatePayload = z.input<typeof allocateSchema>;

/**
 * Open a lot (first allocation) or re-allocate an opened one. The costs are
 * worked out here with the same allocateLot() the preview used, then saved
 * in one database call that re-checks they add up.
 *
 * New rows marked bulk aren't created as items — they're added to the lot's
 * bulk count. Existing items marked bulk on a re-allocation stay, at $0.
 */
export async function allocateLotAction(
  lotId: unknown,
  payload: unknown
): Promise<{ error?: string; lossCents?: number }> {
  const { supabase } = await requireUser();
  const idParsed = z.string().uuid().safeParse(lotId);
  const p = allocateSchema.safeParse(payload);
  if (!idParsed.success) return { error: "Missing the lot." };
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid allocation." };

  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("*")
    .eq("id", idParsed.data)
    .maybeSingle<Lot>();
  if (lotError) return { error: lotError.message };
  if (!lot) return { error: "Lot not found." };

  const reallocating = lot.opened_on !== null;
  if (reallocating && !p.data.reason) {
    return { error: "Say why you're re-allocating — it goes in the log." };
  }

  const kept = p.data.rows.filter((r) => r.item_id !== null || r.sellable);
  const newBulk = p.data.rows.length - kept.length;
  for (const r of kept) {
    if (r.item_id === null && r.name === "") return { error: "Every item needs a name." };
  }

  const basis = Number(lot.total_cost_cents) - Number(lot.writedown_cents);
  const inputs = kept.map((r, i) => ({ key: String(i), valueCents: r.value_cents, sellable: r.sellable }));
  const problem = allocationProblem(basis, inputs);
  if (problem) return { error: problem };
  const alloc = allocateLot(basis, inputs);

  const threshold = await getBulkThresholdCents();
  const { data, error } = await supabase.rpc("allocate_lot", {
    p_lot_id: lot.id,
    p_allocated_on: reallocating ? new Date().toISOString().slice(0, 10) : p.data.opened_on,
    p_reason: reallocating ? p.data.reason : null,
    p_threshold_cents: threshold,
    p_bulk_count: p.data.bulk_count + newBulk,
    p_bulk_note: p.data.bulk_note,
    p_lines: kept.map((r, i) => ({
      item_id: r.item_id,
      name: r.name,
      category: r.category,
      value_cents: r.value_cents,
      sellable: r.sellable,
      cost_cents: alloc.lines[i].costCents,
    })),
  });
  if (error) return { error: error.message };

  revalidateLots(lot.id);
  revalidatePath("/sales");
  return { lossCents: Number((data as { loss_cents?: number } | null)?.loss_cents ?? 0) };
}
