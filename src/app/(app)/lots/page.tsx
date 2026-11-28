import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, type Lot } from "@/lib/types";
import { formatCents } from "@/lib/money";
import PageHero from "@/components/PageHero";
import BulkThresholdForm from "@/components/BulkThresholdForm";
import { getBulkThresholdCents } from "./actions";
import { btnPrimary, btnRow, emptyState, td, th } from "@/lib/ui";

export const metadata = { title: "Lots · Resale Tracker" };

export default async function LotsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lots")
    .select("*")
    .order("purchased_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const lots = (data ?? []) as Lot[];

  const { data: itemRows, error: itemError } = await supabase
    .from("items")
    .select("lot_id")
    .not("lot_id", "is", null);
  if (itemError) throw new Error(itemError.message);
  const itemCount = new Map<string, number>();
  for (const r of itemRows ?? []) {
    const k = r.lot_id as string;
    itemCount.set(k, (itemCount.get(k) ?? 0) + 1);
  }

  const threshold = await getBulkThresholdCents();
  const sealed = lots.filter((l) => !l.opened_on);
  const sealedCost = sealed.reduce((s, l) => s + l.total_cost_cents - l.writedown_cents, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHero
        title="Lots"
        description="Boxes, packs and sealed product you open into items. Unopened, a lot is inventory at its full cost; opening it splits that cost across what you pulled, by market value, and locks it."
        stats={[
          { label: "Sealed", value: String(sealed.length) },
          { label: "Sealed cost", value: formatCents(sealedCost) },
          { label: "Opened", value: String(lots.length - sealed.length) },
        ]}
      />

      <section className="card px-6 py-4">
        <BulkThresholdForm cents={threshold} />
      </section>

      <div className="flex">
        <span className="grow" />
        <Link href="/lots/new" className={btnPrimary}>
          Add lot
        </Link>
      </div>

      {lots.length === 0 ? (
        <div className={emptyState}>
          No lots yet. Add a box or pack when you buy it, then open it here
          when you rip it.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="bg-inset">
                  <th className={`${th} pl-5`}>Lot</th>
                  <th className={th}>Purchased</th>
                  <th className={th}>Status</th>
                  <th className={`${th} text-right`}>Items</th>
                  <th className={`${th} text-right`}>Bulk</th>
                  <th className={`${th} text-right`}>Cost</th>
                  <th className={`${th} pr-5`}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td className={`${td} pl-5`}>
                      <Link href={`/lots/${l.id}`} className="font-semibold hover:underline">
                        {l.name}
                      </Link>
                      <div className="cap mt-0.5">{l.category}</div>
                    </td>
                    <td className={`${td} tnum text-ink-2`}>{formatDate(l.purchased_on)}</td>
                    <td className={td}>
                      {l.opened_on ? (
                        <span className="tnum text-ink-2">Opened {formatDate(l.opened_on)}</span>
                      ) : (
                        <span className="rounded-full bg-soft px-2.5 py-1 text-[11px] font-semibold text-on-soft">
                          Sealed
                        </span>
                      )}
                    </td>
                    <td className={`${td} tnum text-right`}>{l.opened_on ? (itemCount.get(l.id) ?? 0) : "—"}</td>
                    <td className={`${td} tnum text-right`}>{l.opened_on ? l.bulk_count : "—"}</td>
                    <td className={`${td} disp tnum text-right text-[15px] font-bold`}>
                      {formatCents(l.total_cost_cents)}
                    </td>
                    <td className={`${td} pr-5 text-right`}>
                      <Link href={`/lots/${l.id}`} className={btnRow}>
                        {l.opened_on ? "View" : "Open"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
