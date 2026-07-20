"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { matchImportRows, type MatchCandidate } from "@/lib/importMapping";

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
        payment_received: false,
        shipped: false,
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
      payment_received: false,
      shipped: false,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/inventory");
  revalidatePath("/sales");
  redirect("/inventory");
}
