"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/requireUser";
import { loadTaxData } from "@/lib/taxData";
import { inventoryAtYearEnd } from "@/lib/cogs";
import { planClose } from "@/lib/writedown";

function revalidateAll() {
  revalidatePath("/year-end");
  revalidatePath("/tax-report");
  revalidatePath("/inventory");
  revalidatePath("/investments");
  revalidatePath("/lots");
  revalidatePath("/sales");
  revalidatePath("/dashboard");
}

const closeSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  // `${kind}:${id}` → market value in cents, or null for "no estimate".
  markets: z.record(z.string(), z.number().int().min(0).nullable()),
});

/**
 * Close a tax year: snapshot everything on hand at Dec 31 and write down
 * whatever is worth less than its basis. Each row's basis is re-worked out
 * here from the database — only the market values come from the form.
 */
export async function closeYear(
  payload: unknown
): Promise<{ error?: string; writedownCents?: number }> {
  const { supabase } = await requireUser();
  const p = closeSchema.safeParse(payload);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid close." };
  const { year, markets } = p.data;

  const today = new Date().toISOString().slice(0, 10);
  if (today <= `${year}-12-31`) {
    return { error: `${year} isn't over yet — close it on or after January 1, ${year + 1}.` };
  }

  const data = await loadTaxData(supabase);
  const plan = planClose(inventoryAtYearEnd(data, year), markets);

  const { error } = await supabase.rpc("close_year", {
    p_tax_year: year,
    p_closed_on: today,
    p_lines: plan.lines.map((l) => ({
      kind: l.kind,
      id: l.id,
      name: l.name,
      category: l.category,
      basis_before_cents: l.basisCents,
      market_cents: l.marketCents,
      update_estimate: l.marketEntered,
    })),
  });
  if (error) return { error: error.message };

  revalidateAll();
  return { writedownCents: plan.writedownCents };
}

/** Reopen a closed year to fix it: its write-downs are reversed and the
 * close is kept, marked superseded, with the reason. */
export async function reopenYear(
  closeId: unknown,
  reason: unknown
): Promise<{ error?: string }> {
  const { supabase } = await requireUser();
  const id = z.string().uuid().safeParse(closeId);
  const why = z.string().trim().min(1, "Say why you're reopening it").max(500).safeParse(reason);
  if (!id.success) return { error: "Missing the close." };
  if (!why.success) return { error: why.error.issues[0]?.message ?? "Say why." };

  const { error } = await supabase.rpc("reopen_year", { p_close_id: id.data, p_reason: why.data });
  if (error) return { error: error.message };

  revalidateAll();
  return {};
}
