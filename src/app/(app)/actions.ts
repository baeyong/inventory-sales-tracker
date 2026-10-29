"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { matchImportRows, type MatchCandidate } from "@/lib/importMapping";
import { splitPayout } from "@/lib/money";
import { FALLBACK_GRADING_COST, GRADES } from "@/lib/grading";
import type { GradeMap } from "@/lib/types";

export type FormState = {
  error?: string;
  /** A short success message, for forms that stay on the page. */
  notice?: string;
  /** Submitted values echoed back so a failed submit doesn't blank the form. */
  values?: Record<string, string>;
} | null;

function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** Attach a hint when the DB rejects a column the schema doesn't know —
 * that means a migration in supabase/migrations/ hasn't been run yet. */
function dbError(message: string): string {
  if (/schema cache|column .* does not exist/i.test(message)) {
    return `${message} — the database is missing a migration. Run the newest file in supabase/migrations/ in the Supabase SQL Editor, then retry.`;
  }
  return message;
}

// Fields hidden by the form (e.g. card fields on a general item) arrive as
// null, not "" — both mean "not provided".
const optionalText = z
  .string()
  .nullable()
  .transform((s) => {
    const t = (s ?? "").trim();
    return t === "" ? null : t;
  });

const dateField = z
  .string()
  .nullable()
  .transform((s) => (s ?? "").trim())
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
      .or(z.literal("").transform(() => null))
  );

const moneyField = z.coerce
  .number({ error: "Enter a valid amount" })
  .min(0, "Amount can't be negative");

// Like moneyField but blank-able. The empty branch has to come first: z.coerce
// would happily turn "" into 0, which would read as "worth nothing".
const optionalMoneyField = z
  .string()
  .nullable()
  .transform((s) => (s ?? "").trim())
  .transform((s) => (s === "" ? null : Number(s)))
  .pipe(
    z
      .number({ error: "Enter a valid value" })
      .min(0, "Value can't be negative")
      .nullable()
  );

const itemSchema = z
  .object({
    category: z
      .string()
      .nullable()
      .transform((s) => (s ?? "").trim() || "General"),
    name: z.string().trim().min(1, "Name is required"),
    description: optionalText,
    purchase_price: moneyField,
    purchase_date: dateField,
    purchase_platform: optionalText,
    est_value: optionalMoneyField,
    listed: z.boolean(),
    quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
    card_set: optionalText,
    card_number: optionalText,
    player: optionalText,
    condition: z.enum(["raw", "graded"]).or(z.literal("").transform(() => null)),
    grade_company: optionalText,
    grade: optionalText,
    plan_to_grade: z.boolean(),
    market_platform: optionalText,
    market_search: optionalText,
    ripped_from_id: optionalText,
  })
  .transform((v) =>
    /card/i.test(v.category)
      ? { ...v, condition: v.condition ?? "raw" }
      : {
          ...v,
          card_set: null,
          card_number: null,
          player: null,
          condition: null,
          grade_company: null,
          grade: null,
          plan_to_grade: false,
        }
  )
  // Only a raw card can be lined up for grading. A raw card keeps its grader:
  // it's the company it's been sent to while out for grading.
  .transform((v) =>
    v.condition === "graded"
      ? { ...v, plan_to_grade: false }
      : { ...v, grade: null }
  );

const saleSchema = z.object({
  sale_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Sale date is required"),
  sale_platform: z.string().trim().min(1, "Platform is required"),
  // Net payout may be negative when fees exceed the sale price.
  sale_payout: z.coerce.number({ error: "Enter a valid amount" }),
  buyer: optionalText,
});

function itemPayload(formData: FormData) {
  return itemSchema.safeParse({
    category: formData.get("category"),
    name: formData.get("name"),
    description: formData.get("description"),
    purchase_price: formData.get("purchase_price"),
    purchase_date: formData.get("purchase_date"),
    purchase_platform: formData.get("purchase_platform"),
    est_value: formData.get("est_value"),
    listed: formData.get("listed") === "on",
    quantity: formData.get("quantity"),
    card_set: formData.get("card_set"),
    card_number: formData.get("card_number"),
    player: formData.get("player"),
    condition: formData.get("condition") ?? "",
    grade_company: formData.get("grade_company"),
    grade: formData.get("grade"),
    plan_to_grade: formData.get("plan_to_grade") === "on",
    market_platform: formData.get("market_platform"),
    market_search: formData.get("market_search"),
    ripped_from_id: formData.get("ripped_from_id"),
  });
}

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

type Db = Awaited<ReturnType<typeof createClient>>;

export type RippedBox = {
  id: string;
  name: string;
  purchase_price: number;
  opened_at: string | null;
  pulled: number; // how many items already point at this box
};

/** Ripped boxes a pulled card can be assigned to, newest first, each with the
 * number of items already pulled from it so the form can show the split. */
export async function listRippedBoxes(): Promise<RippedBox[]> {
  const { supabase, user } = await requireUser();

  const { data: boxes, error: boxesError } = await supabase
    .from("items")
    .select("id, name, purchase_price, opened_at")
    .eq("user_id", user.id)
    .not("opened_at", "is", null)
    .order("opened_at", { ascending: false });
  if (boxesError) throw new Error(boxesError.message);

  const { data: links, error: linksError } = await supabase
    .from("items")
    .select("ripped_from_id")
    .eq("user_id", user.id)
    .not("ripped_from_id", "is", null);
  if (linksError) throw new Error(linksError.message);

  const counts = new Map<string, number>();
  for (const r of links ?? []) {
    const k = r.ripped_from_id as string;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  return (boxes ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    purchase_price: Number(b.purchase_price),
    opened_at: b.opened_at as string | null,
    pulled: counts.get(b.id as string) ?? 0,
  }));
}

/** Spread a ripped box's cost evenly across every item pulled from it.
 *
 * Sold cards are included in the divisor, so the shares always add back up to
 * exactly what the box cost — which does mean assigning a new card restates
 * the cost basis (and therefore the recorded profit) of cards already sold.
 * Call after anything that changes which items point at the box, or the box's
 * own price. */
async function resplitBox(db: Db, userId: string, boxId: string) {
  const { data: box } = await db
    .from("items")
    .select("purchase_price")
    .eq("id", boxId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!box) return;

  const { data: pulled } = await db
    .from("items")
    .select("id")
    .eq("ripped_from_id", boxId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const ids = (pulled ?? []).map((r) => r.id as string);
  if (ids.length === 0) return;

  // Same cent-by-cent distribution as a quantity > 1 add: split in integer
  // cents and hand the remainder to the earliest rows, so three cards out of a
  // $10 box come to 3.34 + 3.33 + 3.33 rather than three lots of 3.3333.
  const totalCents = Math.round(Number(box.purchase_price) * 100);
  const base = Math.floor(totalCents / ids.length);
  const extra = totalCents - base * ids.length;

  await Promise.all(
    ids.map((id, i) =>
      db
        .from("items")
        .update({ purchase_price: (base + (i < extra ? 1 : 0)) / 100 })
        .eq("id", id)
        .eq("user_id", userId)
    )
  );
}

export async function createItem(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const parsed = itemPayload(formData);
  if (!parsed.success) {
    return { error: firstError(parsed.error), values: formValues(formData) };
  }

  // A quantity > 1 creates one entry per unit (each tracked, listed, and sold
  // on its own), splitting the total cost evenly across them to the cent.
  const { quantity, ...rest } = parsed.data;
  const totalCents = Math.round(rest.purchase_price * 100);
  const baseCents = Math.floor(totalCents / quantity);
  const extra = totalCents - baseCents * quantity;
  const rows = Array.from({ length: quantity }, (_, i) => ({
    ...rest,
    quantity: 1,
    purchase_price: (baseCents + (i < extra ? 1 : 0)) / 100,
    user_id: user.id,
  }));

  const { error } = await supabase.from("items").insert(rows);
  if (error) {
    return { error: dbError(error.message), values: formValues(formData) };
  }

  if (rest.ripped_from_id) {
    await resplitBox(supabase, user.id, rest.ripped_from_id);
  }

  revalidatePath("/inventory");
  revalidatePath("/ripped");
  redirect("/inventory");
}

export async function updateItem(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing item id." };

  const parsed = itemPayload(formData);
  if (!parsed.success) {
    return { error: firstError(parsed.error), values: formValues(formData) };
  }

  // Read the old link before overwriting it: moving a card between boxes has
  // to re-split both the box it left and the one it joined.
  const { data: prev } = await supabase
    .from("items")
    .select("ripped_from_id, opened_at, plan_to_grade")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("items")
    .update(parsed.data)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return { error: dbError(error.message), values: formValues(formData) };
  }

  const affected = new Set<string>();
  if (prev?.ripped_from_id) affected.add(prev.ripped_from_id as string);
  if (parsed.data.ripped_from_id) affected.add(parsed.data.ripped_from_id);
  // Editing a ripped box's own price has to flow down to everything pulled
  // from it, otherwise the shares silently stop adding up.
  if (prev?.opened_at) affected.add(id);
  for (const boxId of affected) await resplitBox(supabase, user.id, boxId);

  revalidatePath("/inventory");
  revalidatePath("/sales");
  revalidatePath("/ripped");
  revalidatePath("/grading");
  // Just lined up for grading: stay on the card so its calculator can be
  // filled in.
  if (parsed.data.plan_to_grade && !prev?.plan_to_grade) {
    revalidatePath(`/inventory/${id}`);
    redirect(`/inventory/${id}#grading`);
  }
  redirect("/inventory");
}

export async function deleteItem(formData: FormData) {
  const { supabase, user } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const back = formData.get("back") === "/sales" ? "/sales" : "/inventory";
  if (!id) redirect(back);

  const { data: gone } = await supabase
    .from("items")
    .select("ripped_from_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  await supabase.from("items").delete().eq("id", id).eq("user_id", user.id);

  if (gone?.ripped_from_id) {
    await resplitBox(supabase, user.id, gone.ripped_from_id as string);
  }

  revalidatePath("/inventory");
  revalidatePath("/sales");
  revalidatePath("/ripped");
  redirect(back);
}

export async function markSold(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing item id." };

  const parsed = saleSchema.safeParse({
    sale_date: formData.get("sale_date"),
    sale_platform: formData.get("sale_platform"),
    sale_payout: formData.get("sale_payout"),
    buyer: formData.get("buyer"),
  });
  if (!parsed.success) {
    return { error: firstError(parsed.error), values: formValues(formData) };
  }

  const { error } = await supabase
    .from("items")
    .update(parsed.data)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return { error: dbError(error.message), values: formValues(formData) };
  }

  revalidatePath("/inventory");
  revalidatePath("/sales");
  redirect("/sales");
}

const importRowSchema = z
  .object({
    category: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().nullable(),
    purchase_price: z.number().min(0),
    purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    purchase_platform: z.string().nullable(),
    quantity: z.number().int().min(1),
    card_set: z.string().nullable(),
    card_number: z.string().nullable(),
    player: z.string().nullable(),
    condition: z.enum(["raw", "graded"]).nullable(),
    grade_company: z.string().nullable(),
    grade: z.string().nullable(),
    sale_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    sale_platform: z.string().nullable(),
    sale_payout: z.number().nullable(),
    payment_received: z.boolean(),
    shipped: z.boolean(),
    listed: z.boolean(),
  })
  .refine(
    (r) =>
      r.sale_date !== null ||
      (r.sale_platform === null && r.sale_payout === null),
    { message: "Sale platform/payout require a sale date" }
  );

export type ImportRow = z.infer<typeof importRowSchema>;

/** Existing items, in the shape the import matcher consumes — used by the
 * import preview to show which rows will link to existing inventory and
 * which are re-imports of sales already recorded. */
export async function listItemsForImport(): Promise<MatchCandidate[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("items")
    .select(
      "id, name, category, purchase_price, purchase_date, purchase_platform, sale_date, sale_platform, sale_payout, payment_received, shipped, listed"
    );
  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    category: c.category as string,
    purchase_price: Number(c.purchase_price),
    purchase_date: c.purchase_date as string | null,
    purchase_platform: c.purchase_platform as string | null,
    sale_date: c.sale_date as string | null,
    sale_platform: c.sale_platform as string | null,
    sale_payout: c.sale_payout === null ? null : Number(c.sale_payout),
    payment_received: Boolean(c.payment_received),
    shipped: Boolean(c.shipped),
    listed: Boolean(c.listed),
  }));
}

export async function importItems(rows: unknown): Promise<{
  error?: string;
  imported?: number;
  updated?: number;
  duplicates?: number;
}> {
  const { supabase, user } = await requireUser();

  const parsed = z.array(importRowSchema).max(2000).safeParse(rows);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const rowNo =
      typeof issue?.path[0] === "number" ? ` (row ${issue.path[0] + 1})` : "";
    return { error: `${issue?.message ?? "Invalid data"}${rowNo}` };
  }
  if (parsed.data.length === 0) return { error: "No rows to import." };

  const candidates = await listItemsForImport();
  const dispositions = matchImportRows(parsed.data, candidates);

  const inserts = parsed.data.filter((_, i) => dispositions[i].kind === "insert");
  const updates = parsed.data
    .map((row, i) => ({ row, disposition: dispositions[i] }))
    .filter(
      (u): u is { row: ImportRow; disposition: { kind: "update"; id: string } } =>
        u.disposition.kind === "update"
    );
  const duplicates = dispositions.filter((d) => d.kind === "duplicate").length;

  if (inserts.length > 0) {
    const { error } = await supabase
      .from("items")
      .insert(inserts.map((r) => ({ ...r, user_id: user.id })));
    if (error) return { error: dbError(error.message) };
  }

  for (const { row, disposition } of updates) {
    const cand = candidates.find((c) => c.id === disposition.id);
    const { error } = await supabase
      .from("items")
      .update({
        sale_date: row.sale_date ?? cand?.sale_date ?? null,
        // Never blank out details the existing record already has.
        ...(row.sale_platform !== null && { sale_platform: row.sale_platform }),
        ...(row.sale_payout !== null && { sale_payout: row.sale_payout }),
        ...(row.purchase_platform !== null && {
          purchase_platform: row.purchase_platform,
        }),
        ...(row.payment_received && { payment_received: true }),
        ...(row.shipped && { shipped: true }),
        ...(row.listed && { listed: true }),
        ...(row.category !== "General" &&
          cand?.category === "General" && { category: row.category }),
      })
      .eq("id", disposition.id)
      .eq("user_id", user.id);
    if (error) return { error: dbError(error.message) };
  }

  revalidatePath("/inventory");
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  return { imported: inserts.length, updated: updates.length, duplicates };
}

/** Canonical number for each real (2+ item) bundle, shared by every page so a
 * bundle keeps the same number and colour on Sales, Pending, etc. — regardless
 * of filters or which members a given view happens to show. Numbered by the
 * bundle's earliest created_at (oldest bundle = 1). */
export async function getBundleNumbers(): Promise<Record<string, number>> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("items")
    .select("bundle_id, created_at")
    .not("bundle_id", "is", null);
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  const firstSeen = new Map<string, string>();
  for (const r of data ?? []) {
    const bid = r.bundle_id as string;
    counts.set(bid, (counts.get(bid) ?? 0) + 1);
    const c = String(r.created_at ?? "");
    const prev = firstSeen.get(bid);
    if (prev === undefined || c < prev) firstSeen.set(bid, c);
  }

  const bundleIds = [...counts.keys()]
    .filter((b) => (counts.get(b) ?? 0) >= 2)
    .sort((a, b) => {
      const ca = firstSeen.get(a) ?? "";
      const cb = firstSeen.get(b) ?? "";
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a < b ? -1 : 1;
    });

  const out: Record<string, number> = {};
  bundleIds.forEach((b, i) => (out[b] = i + 1));
  return out;
}

/** Every item the signed-in user owns — for the Download Backup feature.
 * RLS scopes this to the current user. */
export async function exportItems(): Promise<Record<string, unknown>[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

const idListSchema = z.array(z.string().min(1)).min(1).max(2000);

export async function bulkSetCategory(
  ids: unknown,
  category: unknown
): Promise<{ error?: string; updated?: number }> {
  const { supabase, user } = await requireUser();

  const idsParsed = idListSchema.safeParse(ids);
  const catParsed = z.string().trim().min(1).max(60).safeParse(category);
  if (!idsParsed.success) return { error: "No items selected." };
  if (!catParsed.success) return { error: "Enter a category name." };

  const { error, count } = await supabase
    .from("items")
    .update({ category: catParsed.data }, { count: "exact" })
    .in("id", idsParsed.data)
    .eq("user_id", user.id);
  if (error) return { error: dbError(error.message) };

  revalidatePath("/inventory");
  revalidatePath("/sales");
  return { updated: count ?? 0 };
}

const estValueEditsSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      est_value: z.number().min(0, "Value can't be negative").nullable(),
    })
  )
  .min(1)
  .max(2000);

/** Save inline-edited estimated values in one bulk write. Each row's est_value
 * is updated independently (null clears it). RLS scopes to the current user. */
export async function bulkSetEstValues(
  edits: unknown
): Promise<{ error?: string; updated?: number }> {
  const { supabase, user } = await requireUser();

  const parsed = estValueEditsSchema.safeParse(edits);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid values." };
  }

  for (const { id, est_value } of parsed.data) {
    const { error } = await supabase
      .from("items")
      .update({ est_value })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { error: dbError(error.message) };
  }

  revalidatePath("/inventory");
  return { updated: parsed.data.length };
}

const bundleSaleSchema = z.object({
  sale_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Sale date is required"),
  sale_platform: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s)),
  total_payout: z.coerce.number({ error: "Enter a valid amount" }),
  buyer: optionalText,
});

/** Mark several inventory items sold as one bundle: the total payout is
 * divided evenly (to the cent) across them, all sharing the sale date and
 * platform. Each item keeps its own cost. */
export async function bulkMarkSold(
  ids: unknown,
  patch: unknown
): Promise<{ error?: string; sold?: number }> {
  const { supabase, user } = await requireUser();

  const idsParsed = idListSchema.safeParse(ids);
  const p = bundleSaleSchema.safeParse(patch);
  if (!idsParsed.success) return { error: "No items selected." };
  if (!p.success) {
    return { error: p.error.issues[0]?.message ?? "Invalid sale details." };
  }

  const shares = splitPayout(p.data.total_payout, idsParsed.data.length);
  // Tag a multi-item bundle so the Sales page can show what sold together.
  const bundleId =
    idsParsed.data.length > 1 ? crypto.randomUUID() : null;

  for (let i = 0; i < idsParsed.data.length; i++) {
    const { error } = await supabase
      .from("items")
      .update({
        sale_date: p.data.sale_date,
        sale_platform: p.data.sale_platform,
        sale_payout: shares[i],
        buyer: p.data.buyer,
        bundle_id: bundleId,
      })
      .eq("id", idsParsed.data[i])
      .is("sale_date", null) // don't re-sell an already-sold item
      .eq("user_id", user.id);
    if (error) return { error: dbError(error.message) };
  }

  revalidatePath("/inventory");
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  return { sold: idsParsed.data.length };
}

const bundleEditSchema = z.object({
  sale_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Sale date is required"),
  sale_platform: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s)),
  buyer: optionalText,
  // null → leave each item's payout as-is; a number → re-split evenly.
  // z.null() must come first so a blank field isn't coerced to 0.
  total_payout: z.union([
    z.null(),
    z.coerce.number({ error: "Enter a valid amount" }),
  ]),
  // true → (re)group the selection under one shared bundle id.
  bundle: z.boolean(),
});

/** Edit the sale details of several already-sold items at once — the whole
 * point being to fix a bundle (date, platform, buyer, or the split total)
 * in one go. Leaving the total blank keeps each item's existing payout. */
export async function bulkUpdateSale(
  ids: unknown,
  patch: unknown
): Promise<{ error?: string; updated?: number }> {
  const { supabase, user } = await requireUser();

  const idsParsed = idListSchema.safeParse(ids);
  const p = bundleEditSchema.safeParse(patch);
  if (!idsParsed.success) return { error: "No items selected." };
  if (!p.success) {
    return { error: p.error.issues[0]?.message ?? "Invalid sale details." };
  }

  const shares =
    p.data.total_payout === null
      ? null
      : splitPayout(p.data.total_payout, idsParsed.data.length);
  // Only a genuine multi-item selection can be a bundle.
  const bundleId =
    p.data.bundle && idsParsed.data.length > 1 ? crypto.randomUUID() : null;

  for (let i = 0; i < idsParsed.data.length; i++) {
    const { error } = await supabase
      .from("items")
      .update({
        sale_date: p.data.sale_date,
        sale_platform: p.data.sale_platform,
        buyer: p.data.buyer,
        ...(shares && { sale_payout: shares[i] }),
        ...(p.data.bundle && { bundle_id: bundleId }),
      })
      .eq("id", idsParsed.data[i])
      .not("sale_date", "is", null) // only touch items already sold
      .eq("user_id", user.id);
    if (error) return { error: dbError(error.message) };
  }

  revalidatePath("/inventory");
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath("/pending");
  return { updated: idsParsed.data.length };
}

const fulfillmentSchema = z.object({
  payment_received: z.boolean().optional(),
  shipped: z.boolean().optional(),
  listed: z.boolean().optional(),
});

/** Toggle payment/shipped on a sold item from the Sales page. */
export async function updateFulfillment(
  id: unknown,
  patch: unknown
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();

  const idParsed = z.string().min(1).safeParse(id);
  const patchParsed = fulfillmentSchema.safeParse(patch);
  if (!idParsed.success || !patchParsed.success) {
    return { error: "Invalid request." };
  }

  const { error } = await supabase
    .from("items")
    .update(patchParsed.data)
    .eq("id", idParsed.data)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/sales");
  revalidatePath("/pending");
  return {};
}

/** Set payment/shipped on several items at once — e.g. a bundle that ships
 * as one parcel and is paid in one go. */
export async function bulkSetFulfillment(
  ids: unknown,
  patch: unknown
): Promise<{ error?: string; updated?: number }> {
  const { supabase, user } = await requireUser();

  const idsParsed = idListSchema.safeParse(ids);
  const patchParsed = fulfillmentSchema.safeParse(patch);
  if (!idsParsed.success) return { error: "No items selected." };
  if (!patchParsed.success || Object.keys(patchParsed.data).length === 0) {
    return { error: "Nothing to update." };
  }

  const { error, count } = await supabase
    .from("items")
    .update(patchParsed.data, { count: "exact" })
    .in("id", idsParsed.data)
    .eq("user_id", user.id);
  if (error) return { error: dbError(error.message) };

  revalidatePath("/inventory");
  revalidatePath("/sales");
  revalidatePath("/pending");
  return { updated: count ?? 0 };
}

export async function bulkDeleteItems(
  ids: unknown
): Promise<{ error?: string; deleted?: number }> {
  const { supabase, user } = await requireUser();

  const parsed = idListSchema.safeParse(ids);
  if (!parsed.success) return { error: "No items selected." };

  // Collect the boxes these items came from before the rows disappear.
  const { data: doomed } = await supabase
    .from("items")
    .select("ripped_from_id")
    .in("id", parsed.data)
    .eq("user_id", user.id)
    .not("ripped_from_id", "is", null);
  const boxes = new Set(
    (doomed ?? []).map((r) => r.ripped_from_id as string)
  );

  const { error, count } = await supabase
    .from("items")
    .delete({ count: "exact" })
    .in("id", parsed.data)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  for (const boxId of boxes) await resplitBox(supabase, user.id, boxId);

  revalidatePath("/inventory");
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath("/ripped");
  return { deleted: count ?? 0 };
}

export async function bulkMarkUnsold(
  ids: unknown
): Promise<{ error?: string; returned?: number }> {
  const { supabase, user } = await requireUser();

  const parsed = idListSchema.safeParse(ids);
  if (!parsed.success) return { error: "No items selected." };

  const { error, count } = await supabase
    .from("items")
    .update(
      {
        sale_date: null,
        sale_platform: null,
        sale_payout: null,
        buyer: null,
        payment_received: false,
        shipped: false,
        bundle_id: null,
      },
      { count: "exact" }
    )
    .in("id", parsed.data)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  return { returned: count ?? 0 };
}

/** Move items into the Personal Collection: keepers you are not selling. They
 * leave Inventory and, unlike Investments, are reported separately from
 * business stock in the Tax Summary. Reversible with bulkUnmarkPersonal. */
export async function bulkMarkPersonal(
  ids: unknown,
  movedDate: unknown
): Promise<{ error?: string; moved?: number }> {
  const { supabase, user } = await requireUser();

  const idsParsed = idListSchema.safeParse(ids);
  const dateParsed = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required")
    .safeParse(movedDate);
  if (!idsParsed.success) return { error: "No items selected." };
  if (!dateParsed.success) {
    return { error: dateParsed.error.issues[0]?.message ?? "Invalid date." };
  }

  const { error, count } = await supabase
    .from("items")
    .update({ personal_at: dateParsed.data }, { count: "exact" })
    .in("id", idsParsed.data)
    .is("sale_date", null) // sold items aren't keepers
    .is("opened_at", null) // neither is ripped product
    .is("invested_at", null) // move a holding back to Inventory first
    .eq("user_id", user.id);
  if (error) return { error: dbError(error.message) };

  revalidatePath("/inventory");
  revalidatePath("/collection");
  revalidatePath("/dashboard");
  return { moved: count ?? 0 };
}

/** Move a keeper back into Inventory. */
export async function bulkUnmarkPersonal(
  ids: unknown
): Promise<{ error?: string; returned?: number }> {
  const { supabase, user } = await requireUser();

  const parsed = idListSchema.safeParse(ids);
  if (!parsed.success) return { error: "No items selected." };

  const { error, count } = await supabase
    .from("items")
    .update({ personal_at: null }, { count: "exact" })
    .in("id", parsed.data)
    .eq("user_id", user.id);
  if (error) return { error: dbError(error.message) };

  revalidatePath("/inventory");
  revalidatePath("/collection");
  revalidatePath("/dashboard");
  return { returned: count ?? 0 };
}

/** Move items into Investments: long-term holds you don't plan to flip soon.
 * They leave Inventory but stay owned and unsold, so they keep their cost and
 * estimated value. Reversible with bulkUnmarkInvestment. */
export async function bulkMarkInvestment(
  ids: unknown,
  movedDate: unknown
): Promise<{ error?: string; moved?: number }> {
  const { supabase, user } = await requireUser();

  const idsParsed = idListSchema.safeParse(ids);
  const dateParsed = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required")
    .safeParse(movedDate);
  if (!idsParsed.success) return { error: "No items selected." };
  if (!dateParsed.success) {
    return { error: dateParsed.error.issues[0]?.message ?? "Invalid date." };
  }

  const { error, count } = await supabase
    .from("items")
    .update({ invested_at: dateParsed.data }, { count: "exact" })
    .in("id", idsParsed.data)
    .is("sale_date", null) // sold items aren't holdings
    .is("opened_at", null) // neither is ripped product
    .eq("user_id", user.id);
  if (error) return { error: dbError(error.message) };

  revalidatePath("/inventory");
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { moved: count ?? 0 };
}

/** Move a holding back into Inventory. */
export async function bulkUnmarkInvestment(
  ids: unknown
): Promise<{ error?: string; returned?: number }> {
  const { supabase, user } = await requireUser();

  const parsed = idListSchema.safeParse(ids);
  if (!parsed.success) return { error: "No items selected." };

  const { error, count } = await supabase
    .from("items")
    .update({ invested_at: null }, { count: "exact" })
    .in("id", parsed.data)
    .eq("user_id", user.id);
  if (error) return { error: dbError(error.message) };

  revalidatePath("/inventory");
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { returned: count ?? 0 };
}

/** Rip open sealed product: it leaves inventory for the "For the Love of the
 * Game" page, keeping its cost. Pulled cards are added separately as their own
 * $0-cost inventory items. Can't open something already sold. */
export async function bulkMarkOpened(
  ids: unknown,
  openedDate: unknown
): Promise<{ error?: string; opened?: number }> {
  const { supabase, user } = await requireUser();

  const idsParsed = idListSchema.safeParse(ids);
  const dateParsed = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Opened date is required")
    .safeParse(openedDate);
  if (!idsParsed.success) return { error: "No items selected." };
  if (!dateParsed.success) {
    return { error: dateParsed.error.issues[0]?.message ?? "Invalid date." };
  }

  const { error, count } = await supabase
    .from("items")
    .update({ opened_at: dateParsed.data }, { count: "exact" })
    .in("id", idsParsed.data)
    .is("sale_date", null) // can't rip something already sold
    .eq("user_id", user.id);
  if (error) return { error: dbError(error.message) };

  revalidatePath("/inventory");
  revalidatePath("/ripped");
  revalidatePath("/dashboard");
  return { opened: count ?? 0 };
}

/** Move opened product back into inventory (undo a rip). */
export async function bulkMarkUnopened(
  ids: unknown
): Promise<{ error?: string; returned?: number }> {
  const { supabase, user } = await requireUser();

  const parsed = idListSchema.safeParse(ids);
  if (!parsed.success) return { error: "No items selected." };

  const { error, count } = await supabase
    .from("items")
    .update({ opened_at: null }, { count: "exact" })
    .in("id", parsed.data)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/ripped");
  revalidatePath("/dashboard");
  return { returned: count ?? 0 };
}

/** Correct the date on already-ripped product, from its edit screen. */
export async function updateOpenedDate(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing item id." };

  const parsed = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Opened date is required")
    .safeParse(formData.get("opened_at"));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid date.",
      values: formValues(formData),
    };
  }

  const { error, count } = await supabase
    .from("items")
    .update({ opened_at: parsed.data }, { count: "exact" })
    .eq("id", id)
    .is("sale_date", null) // a sold item isn't ripped product
    .eq("user_id", user.id);
  if (error) {
    return { error: dbError(error.message), values: formValues(formData) };
  }
  if (!count) {
    return {
      error: "Couldn't update — this item has since been sold.",
      values: formValues(formData),
    };
  }

  revalidatePath("/inventory");
  revalidatePath("/ripped");
  revalidatePath("/dashboard");
  redirect("/ripped");
}

export async function markUnsold(formData: FormData) {
  const { supabase, user } = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/sales");

  await supabase
    .from("items")
    .update({
      sale_date: null,
      sale_platform: null,
      sale_payout: null,
      buyer: null,
      payment_received: false,
      shipped: false,
      bundle_id: null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/inventory");
  revalidatePath("/sales");
  redirect("/inventory");
}

// --- Miscellaneous business expenses ---

const expenseSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  amount: moneyField,
  spent_on: dateField,
  source: optionalText,
  notes: optionalText,
});

function expensePayload(formData: FormData) {
  return expenseSchema.safeParse({
    name: formData.get("name"),
    amount: formData.get("amount"),
    spent_on: formData.get("spent_on"),
    source: formData.get("source"),
    notes: formData.get("notes"),
  });
}

export async function createExpense(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const parsed = expensePayload(formData);
  if (!parsed.success) {
    return { error: firstError(parsed.error), values: formValues(formData) };
  }

  const { error } = await supabase
    .from("expenses")
    .insert({ ...parsed.data, user_id: user.id });
  if (error) {
    return { error: dbError(error.message), values: formValues(formData) };
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  redirect("/expenses");
}

export async function updateExpense(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing expense id." };

  const parsed = expensePayload(formData);
  if (!parsed.success) {
    return { error: firstError(parsed.error), values: formValues(formData) };
  }

  const { error } = await supabase
    .from("expenses")
    .update(parsed.data)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return { error: dbError(error.message), values: formValues(formData) };
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  redirect("/expenses");
}

export async function deleteExpense(formData: FormData) {
  const { supabase, user } = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (id) {
    await supabase.from("expenses").delete().eq("id", id).eq("user_id", user.id);
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  redirect("/expenses");
}

/** Every expense the signed-in user owns — for the expenses page and the Tax
 * Summary export. RLS scopes this to the current user. */
export async function listExpenses(): Promise<Record<string, unknown>[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("spent_on", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

// Real DB columns, so a restore only writes known fields (an old backup missing
// newer columns just falls back to their defaults).
const ITEM_COLUMNS = [
  "id", "category", "name", "description", "purchase_price", "purchase_date",
  "purchase_platform", "est_value", "listed", "quantity", "card_set",
  "card_number",
  "player", "condition", "grade_company", "grade", "sale_date", "sale_platform",
  "sale_payout", "buyer", "payment_received", "shipped", "bundle_id",
  "opened_at", "ripped_from_id", "invested_at", "personal_at",
  "market_platform",
  "market_search",
  "grading_cost", "grade_plan_cost", "plan_to_grade", "grade_values", "grade_odds", "grade_pop",
  "grading_submitted_at", "grading_returned_at", "grade_predicted",
  "cert_number",
  "created_at", "updated_at",
] as const;
const EXPENSE_COLUMNS = [
  "id", "name", "amount", "spent_on", "source", "notes", "created_at",
  "updated_at",
] as const;

function pickColumns(
  row: unknown,
  cols: readonly string[],
  userId: string
): Record<string, unknown> {
  const src = (row && typeof row === "object" ? row : {}) as Record<
    string,
    unknown
  >;
  const out: Record<string, unknown> = {};
  for (const c of cols) {
    if (c in src && src[c] !== undefined) out[c] = src[c];
  }
  if (!out.id) out.id = crypto.randomUUID();
  out.user_id = userId; // always the signed-in user, whatever the file said
  return out;
}

/** Restore from a Download-JSON snapshot: re-create every item and expense for
 * the current user. Upserts by id, so it's safe to re-run and never duplicates;
 * it only adds/overwrites, never deletes. Accepts the current object form
 * ({ items, expenses }) or a bare items array from an older backup. */
export async function restoreBackup(
  payload: unknown
): Promise<{ error?: string; items?: number; expenses?: number }> {
  const { supabase, user } = await requireUser();

  let items: unknown[] = [];
  let expenses: unknown[] = [];
  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.items)) items = p.items;
    if (Array.isArray(p.expenses)) expenses = p.expenses;
  } else {
    return { error: "Unrecognized backup file." };
  }
  if (items.length === 0 && expenses.length === 0) {
    return { error: "Nothing to restore in this file." };
  }
  if (items.length > 20000 || expenses.length > 20000) {
    return { error: "Backup is too large to restore in one go." };
  }

  if (items.length > 0) {
    const rows = items.map((r) => pickColumns(r, ITEM_COLUMNS, user.id));
    const { error } = await supabase.from("items").upsert(rows, {
      onConflict: "id",
    });
    if (error) return { error: dbError(error.message) };
  }
  if (expenses.length > 0) {
    const rows = expenses.map((r) => pickColumns(r, EXPENSE_COLUMNS, user.id));
    const { error } = await supabase.from("expenses").upsert(rows, {
      onConflict: "id",
    });
    if (error) return { error: dbError(error.message) };
  }

  revalidatePath("/inventory");
  revalidatePath("/sales");
  revalidatePath("/pending");
  revalidatePath("/ripped");
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { items: items.length, expenses: expenses.length };
}

// ---------------------------------------------------------------------------
// Grading

function revalidateGrading(id?: string) {
  revalidatePath("/grading");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/inventory/${id}`);
}

/** One numeric field from the calculator: blank means "not entered". */
function gradeNumber(
  raw: FormDataEntryValue | null,
  label: string,
  max?: number
): { value?: number; error?: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "") return {};
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { error: `${label} must be 0 or more.` };
  if (max !== undefined && n > max) return { error: `${label} can't be over ${max}.` };
  return { value: n };
}

/** Collect `${prefix}${key}` fields into a map, skipping blanks. */
function gradeMap(
  formData: FormData,
  prefix: string,
  keys: readonly string[],
  label: (k: string) => string,
  max?: number
): { map: GradeMap | null; error?: string } {
  const map: GradeMap = {};
  for (const k of keys) {
    const r = gradeNumber(formData.get(prefix + k), label(k), max);
    if (r.error) return { map: null, error: r.error };
    if (r.value !== undefined) map[k] = r.value;
  }
  return { map: Object.keys(map).length > 0 ? map : null };
}

const gradeLabel = (k: string) => (k === "raw" ? "Raw value" : `PSA ${k}`);

/** The fee a new card starts on: the last one entered, paid or planned. */
export async function getDefaultGradingCost(): Promise<number> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("items")
    .select("grading_cost, grade_plan_cost")
    .or("grading_cost.not.is.null,grade_plan_cost.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const last = data?.[0];
  const fee = last?.grading_cost ?? last?.grade_plan_cost;
  return fee === null || fee === undefined ? FALLBACK_GRADING_COST : Number(fee);
}

/** Save the "worth grading?" inputs from a card's grading panel. */
export async function saveGradingPlan(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing item id." };

  const values = gradeMap(formData, "value_", ["raw", ...GRADES], gradeLabel);
  const odds = gradeMap(formData, "odds_", GRADES, (k) => `Chance of PSA ${k}`, 100);
  const pop = gradeMap(formData, "pop_", GRADES, (k) => `PSA ${k} pop`);
  const fee = gradeNumber(formData.get("grade_plan_cost"), "Grading cost");
  const bad = values.error ?? odds.error ?? pop.error ?? fee.error;
  if (bad) return { error: bad, values: formValues(formData) };

  const totalOdds = Object.values(odds.map ?? {}).reduce((s, n) => s + n, 0);
  if (totalOdds > 100) {
    return {
      error: `Your chances add up to ${totalOdds}% — keep them at 100% or under.`,
      values: formValues(formData),
    };
  }

  const { error } = await supabase
    .from("items")
    .update({
      grade_values: values.map,
      grade_odds: odds.map,
      grade_pop: pop.map,
      grade_plan_cost: fee.value ?? null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: dbError(error.message), values: formValues(formData) };

  revalidateGrading(id);
  return { notice: "Saved." };
}

/** Add cards to, or take them off, the list of cards you plan to grade. */
export async function setPlanToGrade(
  ids: unknown,
  on: boolean
): Promise<{ error?: string; updated?: number }> {
  const { supabase, user } = await requireUser();
  const parsed = idListSchema.safeParse(ids);
  if (!parsed.success) return { error: "Pick at least one card." };

  const { error, count } = await supabase
    .from("items")
    .update({ plan_to_grade: on === true }, { count: "exact" })
    .in("id", parsed.data)
    .eq("user_id", user.id);
  if (error) return { error: dbError(error.message) };

  revalidateGrading();
  for (const id of parsed.data) revalidatePath(`/inventory/${id}`);
  return { updated: count ?? 0 };
}

const submissionSchema = z.object({
  submitted_at: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date sent is required"),
  company: z.string().trim().min(1, "Pick a grading company"),
  cost: z.coerce
    .number({ error: "Enter the grading cost" })
    .min(0, "Grading cost can't be negative"),
});

/** Send cards to the grader. `cost` is per card — what grading that one card
 * cost (tier plus its share of shipping) — and it joins the card's cost. */
export async function sendToGrading(
  ids: unknown,
  patch: unknown
): Promise<{ error?: string; sent?: number }> {
  const { supabase, user } = await requireUser();
  const idsParsed = idListSchema.safeParse(ids);
  if (!idsParsed.success) return { error: "Pick at least one card." };
  const parsed = submissionSchema.safeParse(patch);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { submitted_at, company, cost } = parsed.data;

  // Only raw, unsold cards that aren't already out.
  const { data: rows, error: readError } = await supabase
    .from("items")
    .select("id, grade_odds")
    .in("id", idsParsed.data)
    .eq("user_id", user.id)
    .is("sale_date", null)
    .is("grading_submitted_at", null)
    .or("condition.is.null,condition.eq.raw");
  if (readError) return { error: dbError(readError.message) };
  if (!rows || rows.length === 0) {
    return { error: "None of those cards can be sent — they're sold, graded or already out." };
  }

  for (const r of rows) {
    // The prediction is fixed now, so later edits don't rewrite history.
    const odds = (r.grade_odds ?? {}) as GradeMap;
    let predicted: string | null = null;
    for (const g of GRADES) {
      if ((odds[g] ?? 0) > 0 && (predicted === null || odds[g] > odds[predicted])) {
        predicted = g;
      }
    }
    const { error } = await supabase
      .from("items")
      .update({
        plan_to_grade: true,
        grading_submitted_at: submitted_at,
        grade_company: company,
        grading_cost: cost,
        grade_predicted: predicted,
      })
      .eq("id", r.id)
      .eq("user_id", user.id);
    if (error) return { error: dbError(error.message) };
  }

  revalidateGrading();
  revalidatePath("/sales");
  for (const r of rows) revalidatePath(`/inventory/${r.id}`);
  return { sent: rows.length };
}

/** Send one card from its own page. */
export async function sendCardToGrading(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const res = await sendToGrading([id], {
    submitted_at: formData.get("submitted_at"),
    company: formData.get("company"),
    cost: formData.get("cost"),
  });
  if (res.error) return { error: res.error, values: formValues(formData) };
  return { notice: "Sent to grading." };
}

const returnSchema = z.object({
  returned_at: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date back is required"),
  company: z.string().trim().min(1, "Pick a grading company"),
  grade: z.string().trim().min(1, "Enter the grade it got"),
  cert_number: optionalText,
  est_value: optionalMoneyField,
});

/** A card is back from the grader: it becomes a graded card worth what it
 * got, and the Grading tab keeps the record. */
export async function markGradeReturned(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing item id." };

  const parsed = returnSchema.safeParse({
    returned_at: formData.get("returned_at"),
    company: formData.get("company"),
    grade: formData.get("grade"),
    cert_number: formData.get("cert_number"),
    est_value: formData.get("est_value"),
  });
  if (!parsed.success) {
    return { error: firstError(parsed.error), values: formValues(formData) };
  }
  const d = parsed.data;

  const { error, count } = await supabase
    .from("items")
    .update(
      {
        grading_returned_at: d.returned_at,
        condition: "graded",
        grade_company: d.company,
        grade: d.grade,
        cert_number: d.cert_number,
        est_value: d.est_value,
        plan_to_grade: false,
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .not("grading_submitted_at", "is", null);
  if (error) return { error: dbError(error.message), values: formValues(formData) };
  if (!count) return { error: "This card isn't out for grading.", values: formValues(formData) };

  revalidateGrading(id);
  revalidatePath("/sales");
  return { notice: "Marked as returned." };
}

const resultSchema = z.object({
  submitted_at: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date sent is required"),
  returned_at: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date back is required"),
  company: z.string().trim().min(1, "Pick a grading company"),
  grade: z.string().trim().min(1, "Enter the grade it got"),
  grade_predicted: optionalText,
  cert_number: optionalText,
  grading_cost: moneyField,
  raw_value: optionalMoneyField,
  est_value: optionalMoneyField,
});

/** Correct the record of a card that's back from grading: dates, grades,
 * the fee, and the raw and current values its gain is worked out from. */
export async function updateGradingResult(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing item id." };

  const parsed = resultSchema.safeParse({
    submitted_at: formData.get("submitted_at"),
    returned_at: formData.get("returned_at"),
    company: formData.get("company"),
    grade: formData.get("grade"),
    grade_predicted: formData.get("grade_predicted"),
    cert_number: formData.get("cert_number"),
    grading_cost: formData.get("grading_cost"),
    raw_value: formData.get("raw_value"),
    est_value: formData.get("est_value"),
  });
  if (!parsed.success) {
    return { error: firstError(parsed.error), values: formValues(formData) };
  }
  const d = parsed.data;
  if (d.returned_at < d.submitted_at) {
    return { error: "It can't come back before it was sent.", values: formValues(formData) };
  }

  // The raw value lives in grade_values with the per-grade prices; keep those.
  const { data: current, error: readError } = await supabase
    .from("items")
    .select("grade_values")
    .eq("id", id)
    .eq("user_id", user.id)
    .not("grading_returned_at", "is", null)
    .maybeSingle();
  if (readError) return { error: dbError(readError.message), values: formValues(formData) };
  if (!current) return { error: "This card isn't back from grading.", values: formValues(formData) };
  const values: GradeMap = { ...((current.grade_values ?? {}) as GradeMap) };
  if (d.raw_value === null) delete values.raw;
  else values.raw = d.raw_value;

  const { error } = await supabase
    .from("items")
    .update({
      grading_submitted_at: d.submitted_at,
      grading_returned_at: d.returned_at,
      grade_company: d.company,
      grade: d.grade,
      grade_predicted: d.grade_predicted,
      cert_number: d.cert_number,
      grading_cost: d.grading_cost,
      grade_values: Object.keys(values).length > 0 ? values : null,
      est_value: d.est_value,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: dbError(error.message), values: formValues(formData) };

  revalidateGrading(id);
  revalidatePath("/sales");
  return { notice: "Saved." };
}

/** Undo a submission entered by mistake: the card goes back to being a
 * candidate and its grading fee comes off its cost. */
export async function cancelGradingSubmission(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await supabase
    .from("items")
    .update({
      grading_submitted_at: null,
      grading_cost: null,
      grade_predicted: null,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("grading_returned_at", null);
  if (error) throw new Error(dbError(error.message));

  revalidateGrading(id);
  revalidatePath("/sales");
}
