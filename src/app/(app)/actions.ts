"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { matchImportRows, type MatchCandidate } from "@/lib/importMapping";
import { splitPayout } from "@/lib/money";

export type FormState = {
  error?: string;
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
    listed: z.boolean(),
    quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
    card_set: optionalText,
    card_number: optionalText,
    player: optionalText,
    condition: z.enum(["raw", "graded"]).or(z.literal("").transform(() => null)),
    grade_company: optionalText,
    grade: optionalText,
    market_platform: optionalText,
    market_search: optionalText,
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
        }
  )
  .transform((v) =>
    v.condition === "graded" ? v : { ...v, grade_company: null, grade: null }
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
    listed: formData.get("listed") === "on",
    quantity: formData.get("quantity"),
    card_set: formData.get("card_set"),
    card_number: formData.get("card_number"),
    player: formData.get("player"),
    condition: formData.get("condition") ?? "",
    grade_company: formData.get("grade_company"),
    grade: formData.get("grade"),
    market_platform: formData.get("market_platform"),
    market_search: formData.get("market_search"),
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

  revalidatePath("/inventory");
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
  redirect("/inventory");
}

export async function deleteItem(formData: FormData) {
  const { supabase, user } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const back = formData.get("back") === "/sales" ? "/sales" : "/inventory";
  if (!id) redirect(back);

  await supabase.from("items").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/inventory");
  revalidatePath("/sales");
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
  const { data } = await supabase
    .from("items")
    .select("bundle_id, created_at")
    .not("bundle_id", "is", null);

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

  const { error, count } = await supabase
    .from("items")
    .delete({ count: "exact" })
    .in("id", parsed.data)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/sales");
  revalidatePath("/dashboard");
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
  "purchase_platform", "listed", "quantity", "card_set", "card_number",
  "player", "condition", "grade_company", "grade", "sale_date", "sale_platform",
  "sale_payout", "buyer", "payment_received", "shipped", "bundle_id",
  "opened_at", "market_platform", "market_search", "created_at", "updated_at",
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
