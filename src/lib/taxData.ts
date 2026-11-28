import type { Db } from "@/lib/supabase/requireUser";
import { fetchAll } from "@/lib/supabase/fetchAll";
import type { TaxData } from "@/lib/cogs";
import type {
  InventoryTransfer,
  Lot,
  YearEndClose,
  YearEndLine,
} from "@/lib/types";

const ITEM_FIELDS =
  "id, name, category, purchase_price, purchase_date, grading_cost, grading_shipping, grading_submitted_at, sale_date, sale_payout, sale_gross_cents, sale_fees_cents, sale_shipping_cents, opened_at, ripped_from_id, personal_at, lot_id, est_value, writedown_cents";

/** Everything the year-end close and the COGS report work from, every row
 * (paged past Supabase's 1,000-row cap). RLS scopes it to the signed-in user. */
export type FullTaxData = Omit<TaxData, "lots" | "closes" | "closeLines" | "transfers"> & {
  lots: Lot[];
  closes: YearEndClose[];
  closeLines: YearEndLine[];
  transfers: InventoryTransfer[];
};

export async function loadTaxData(db: Db): Promise<FullTaxData> {
  const [items, lots, allocations, closes, closeLines, transfers, expenses] =
    await Promise.all([
      fetchAll<TaxData["items"][number]>((a, b) =>
        db.from("items").select(ITEM_FIELDS).order("id").range(a, b)
      ),
      fetchAll<Lot>((a, b) => db.from("lots").select("*").order("id").range(a, b)),
      fetchAll<TaxData["allocations"][number]>((a, b) =>
        db.from("lot_allocations").select("lot_id, version, loss_cents").order("id").range(a, b)
      ),
      fetchAll<YearEndClose>((a, b) =>
        db.from("year_end_closes").select("*").order("id").range(a, b)
      ),
      fetchAll<YearEndLine>((a, b) =>
        db.from("year_end_lines").select("*").order("id").range(a, b)
      ),
      fetchAll<InventoryTransfer>((a, b) =>
        db.from("inventory_transfers").select("*").order("id").range(a, b)
      ),
      fetchAll<TaxData["expenses"][number]>((a, b) =>
        db.from("expenses").select("amount, spent_on").order("id").range(a, b)
      ),
    ]);
  return { items, lots, allocations, closes, closeLines, transfers, expenses };
}
