import Link from "next/link";
import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import PageHero, { type Stat } from "@/components/PageHero";
import LotForm from "@/components/LotForm";
import LotAllocator, { type ExistingRow } from "@/components/LotAllocator";
import DeleteLotButton from "@/components/DeleteLotButton";
import { requireUser } from "@/lib/supabase/requireUser";
import { costBasis, formatDate, type Item, type Lot, type LotAllocation } from "@/lib/types";
import { formatCents, toCents } from "@/lib/money";
import { cardTitle, td, th, toneClass } from "@/lib/ui";
import { getBulkThresholdCents, receiptUrl } from "../actions";

export const metadata = { title: "Lot · Resale Tracker" };

function itemStatus(i: Item): string {
  if (i.sale_date) return `Sold ${formatDate(i.sale_date)}`;
  if (i.personal_at) return "Personal Collection";
  if (i.invested_at) return "Investments";
  return "In inventory";
}

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  const { data: lotRow, error } = await supabase.from("lots").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!lotRow) notFound();
  const lot = lotRow as Lot;

  const [itemsRes, allocRes, catRes] = await Promise.all([
    supabase.from("items").select("*").eq("lot_id", lot.id).order("created_at"),
    supabase.from("lot_allocations").select("*").eq("lot_id", lot.id).order("version", { ascending: false }),
    supabase.from("items").select("category"),
  ]);
  for (const r of [itemsRes, allocRes, catRes]) if (r.error) throw new Error(r.error.message);
  const items = (itemsRes.data ?? []) as Item[];
  const allocations = (allocRes.data ?? []) as LotAllocation[];
  const categories = [...new Set((catRes.data ?? []).map((r) => r.category as string))];

  const threshold = await getBulkThresholdCents();
  const receiptLink = lot.receipt_path ? await receiptUrl(lot.receipt_path) : null;
  const basis = lot.total_cost_cents - lot.writedown_cents;
  const latest = allocations[0] ?? null;
  const today = new Date().toISOString().slice(0, 10);

  // What the latest allocation said about each item, for the table and the
  // re-allocation starting point.
  const lineOf = new Map((latest?.lines ?? []).map((l) => [l.item_id, l]));
  const existing: ExistingRow[] = items.map((i) => {
    const line = lineOf.get(i.id);
    return {
      itemId: i.id,
      name: i.name,
      valueCents: line?.value_cents ?? toCents(i.est_value),
      sellable: line?.sellable ?? toCents(i.purchase_price) > 0,
      sold: !!i.sale_date,
    };
  });
  const allocatedNow = items.reduce((s, i) => s + toCents(i.purchase_price), 0);
  const outOfStep = latest !== null && latest.loss_cents === 0 && allocatedNow !== latest.basis_cents;

  const stats: Stat[] = [
    { label: "Cost", value: formatCents(lot.total_cost_cents) },
    ...(lot.writedown_cents > 0
      ? [{ label: "Written down", value: formatCents(lot.writedown_cents), tone: "neg" as const }]
      : []),
    ...(lot.opened_on
      ? [
          { label: "Items", value: String(items.length) },
          { label: "Bulk", value: String(lot.bulk_count) },
        ]
      : [{ label: "Status", value: "Sealed" }]),
  ];

  return (
    <div className="flex flex-col gap-3">
      <BackLink href="/lots" label="Lots" />
      <PageHero
        title={lot.name}
        description={
          lot.opened_on
            ? `Bought ${formatDate(lot.purchased_on)}${lot.purchase_platform ? ` at ${lot.purchase_platform}` : ""} · opened ${formatDate(lot.opened_on)}.`
            : `Bought ${formatDate(lot.purchased_on)}${lot.purchase_platform ? ` at ${lot.purchase_platform}` : ""}. Still sealed, so it counts as inventory at ${formatCents(basis)}.`
        }
        stats={stats}
      />

      {!lot.opened_on && (
        <LotAllocator
          lotId={lot.id}
          basisCents={basis}
          category={lot.category}
          thresholdCents={threshold}
          mode="open"
          today={today}
        />
      )}

      {lot.opened_on && latest && (
        <section className="card px-6 py-[22px]">
          <h2 className={cardTitle}>Allocation</h2>
          {latest.loss_cents > 0 ? (
            <p className="-mt-2 mb-4 rounded-[12px] bg-warn-surface px-4 py-3 text-[13px] text-warn">
              Nothing in this lot was sellable, so its {formatCents(latest.loss_cents)} was
              recorded as a loss on {formatDate(lot.opened_on)}.
            </p>
          ) : (
            <p className="-mt-2 mb-4 text-[13px] text-muted">
              {formatCents(latest.basis_cents)} split by market value on{" "}
              {formatDate(latest.allocated_on)}. These costs are locked — selling one
              never changes the others.
            </p>
          )}
          {outOfStep && (
            <p className="mb-4 rounded-[12px] bg-warn-surface px-4 py-3 text-[13px] text-warn">
              The items here now add up to {formatCents(allocatedNow)}, not{" "}
              {formatCents(latest.basis_cents)} — probably because one was deleted.
              Re-allocate to put the difference back.
            </p>
          )}
          {items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-inset">
                    <th className={`${th} pl-3`}>Item</th>
                    <th className={`${th} text-right`}>Value at open</th>
                    <th className={`${th} text-right`}>Cost</th>
                    <th className={th}>Status</th>
                    <th className={`${th} text-right`}>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const line = lineOf.get(i.id);
                    const profit =
                      i.sale_date && i.sale_payout !== null
                        ? Number(i.sale_payout) - costBasis(i)
                        : null;
                    return (
                      <tr key={i.id}>
                        <td className={`${td} pl-3`}>
                          <Link href={`/inventory/${i.id}`} className="font-semibold hover:underline">
                            {i.name}
                          </Link>
                          {line && !line.sellable && <span className="cap ml-2">bulk</span>}
                        </td>
                        <td className={`${td} tnum text-right text-ink-2`}>
                          {line ? formatCents(line.value_cents) : "—"}
                        </td>
                        <td className={`${td} disp tnum text-right font-bold`}>
                          {formatCents(toCents(i.purchase_price))}
                          {i.writedown_cents > 0 && (
                            <div className="cap font-normal">−{formatCents(i.writedown_cents)} written down</div>
                          )}
                        </td>
                        <td className={`${td} text-ink-2`}>{itemStatus(i)}</td>
                        <td className={`${td} tnum text-right font-semibold ${toneClass(profit)}`}>
                          {profit === null ? "—" : formatCents(Math.round(profit * 100))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-[13px] text-ink-2">
            Bulk: <span className="tnum font-semibold">{lot.bulk_count}</span> at $0
            {lot.bulk_note && ` · ${lot.bulk_note}`}
          </p>
        </section>
      )}

      {lot.opened_on && (
        <details className="group">
          <summary className="cursor-pointer select-none px-1 text-[13px] font-semibold text-ink-2 hover:text-ink">
            Fix a mistake: re-allocate this lot
          </summary>
          <div className="mt-3">
            <LotAllocator
              lotId={lot.id}
              basisCents={basis}
              category={lot.category}
              thresholdCents={threshold}
              mode="reallocate"
              existing={existing}
              bulkCount={lot.bulk_count}
              bulkNote={lot.bulk_note}
              today={today}
            />
          </div>
        </details>
      )}

      {allocations.length > 0 && (
        <section className="card px-6 py-[22px]">
          <h2 className={cardTitle}>History</h2>
          <ol className="space-y-2 text-[13px]">
            {allocations.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="tnum font-semibold">v{a.version}</span>
                <span className="tnum text-ink-2">{formatDate(a.allocated_on)}</span>
                <span className="text-ink-2">
                  {a.version === 1 ? "Opened" : "Re-allocated"} ·{" "}
                  {a.loss_cents > 0
                    ? `loss of ${formatCents(a.loss_cents)}`
                    : `${formatCents(a.basis_cents)} over ${a.lines.filter((l) => l.sellable).length} sellable`}
                  {" · "}bulk {a.bulk_count}
                </span>
                {a.reason && <span className="w-full text-muted">“{a.reason}”</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h2 className="disp mb-3 mt-2 px-1 text-[15px] font-bold">Details</h2>
        <LotForm lot={lot} userId={user.id} categories={categories} receiptLink={receiptLink} />
      </section>

      {!lot.opened_on && (
        <section className="rounded-[18px] bg-neg-surface px-[22px] py-[18px]">
          <div className="flex flex-wrap items-center gap-3.5">
            <div className="min-w-0">
              <h2 className="text-[13px] font-bold text-neg">Delete this lot</h2>
              <p className="mt-1 text-xs text-ink-2">Permanent. Only sealed lots can be deleted.</p>
            </div>
            <span className="grow" />
            <DeleteLotButton lotId={lot.id} />
          </div>
        </section>
      )}
    </div>
  );
}
