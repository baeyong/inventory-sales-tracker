"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkSetFulfillment, updateFulfillment } from "@/app/(app)/actions";
import { formatDate, formatMoney, type Item } from "@/lib/types";
import { buildBundleMeta, groupBundles, type BundleMeta } from "@/lib/bundles";
import { categoryHue } from "@/lib/categoryHue";

type Field = "payment_received" | "shipped";

function Detail({ item }: { item: Item }) {
  return (
    <span className="cap mt-0.5 block">
      Sold {formatDate(item.sale_date)}
      {item.sale_platform && <> · on {item.sale_platform}</>}
      {item.purchase_platform && <> · from {item.purchase_platform}</>}
      {item.sale_payout !== null && (
        <> · {formatMoney(Number(item.sale_payout))}</>
      )}
      {item.buyer && <> · to {item.buyer}</>}
    </span>
  );
}

function Section({
  title,
  items,
  field,
  actionLabel,
  pending,
  bundleMeta,
  onToggle,
  total,
}: {
  title: string;
  items: Item[];
  field: Field;
  actionLabel: string;
  pending: boolean;
  bundleMeta: Map<string, BundleMeta>;
  onToggle: (item: Item, field: Field) => void;
  total?: number;
}) {
  // Keep bundle members side by side, one row (one checkbox) per bundle.
  const ordered = groupBundles(items, bundleMeta);
  const bundleMembers = new Map<string, Item[]>();
  for (const it of ordered) {
    if (!it.bundle_id || !bundleMeta.has(it.bundle_id)) continue;
    const arr = bundleMembers.get(it.bundle_id) ?? [];
    arr.push(it);
    bundleMembers.set(it.bundle_id, arr);
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between bg-panel px-5 py-[15px]">
        <h2 className="disp text-[15px] font-bold">{title}</h2>
        <div className="flex items-center gap-2">
          {total !== undefined && items.length > 0 && (
            <span className="disp tnum text-[15px] font-bold">
              {formatMoney(total)}
            </span>
          )}
          <span
            className={`tnum rounded-full px-[9px] py-[3px] text-[11px] font-semibold ${
              items.length === 0
                ? "bg-pos-surface text-pos"
                : "bg-warn-surface text-warn"
            }`}
          >
            {items.length === 0 ? "All done" : items.length}
          </span>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">Nothing waiting.</p>
      ) : (
        <ul>
          {ordered.map((item) => {
            const meta = item.bundle_id
              ? bundleMeta.get(item.bundle_id)
              : undefined;
            const members =
              meta && item.bundle_id
                ? (bundleMembers.get(item.bundle_id) ?? [item])
                : [item];
            // Only group when 2+ of the bundle are actually in this section.
            const showBundle = !!meta && members.length >= 2;
            // Grouped members render once, on the first row.
            if (showBundle && members[0].id !== item.id) return null;

            return (
              <li
                key={item.id}
                className="flex items-start gap-3 border-t border-line px-5 py-[13px] text-[13px] first:border-t-0"
              >
                <input
                  type="checkbox"
                  checked={false}
                  disabled={pending}
                  onChange={() => onToggle(members[0], field)}
                  aria-label={
                    showBundle
                      ? `${actionLabel}: bundle ${meta!.num}`
                      : `${actionLabel}: ${item.name}`
                  }
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--pos)]"
                />
                <div className="min-w-0 flex-1">
                  {showBundle && (
                    <span className="mb-1.5 inline-flex rounded-full bg-soft px-[11px] py-1 text-[11px] font-bold text-on-soft">
                      Bundle {meta!.num} · {members.length} items
                    </span>
                  )}
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className={`flex items-center gap-3 ${showBundle ? "mt-1.5" : ""}`}
                    >
                      <span
                        className="h-[30px] w-2 shrink-0 rounded"
                        style={{ background: categoryHue(m.category) }}
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/inventory/${m.id}`}
                          className="font-semibold hover:underline"
                        >
                          {m.name}
                        </Link>
                        <Detail item={m} />
                      </div>
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function PendingLists({
  items,
  bundleNumbers,
}: {
  items: Item[];
  bundleNumbers: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const bundleMeta = buildBundleMeta(bundleNumbers);

  function toggle(item: Item, field: Field) {
    // A bundle ships/pays together, so tick every still-pending sibling at once.
    const siblingIds = item.bundle_id
      ? items.filter((i) => i.bundle_id === item.bundle_id).map((i) => i.id)
      : [item.id];
    startTransition(async () => {
      const res =
        siblingIds.length > 1
          ? await bulkSetFulfillment(siblingIds, { [field]: !item[field] })
          : await updateFulfillment(item.id, { [field]: !item[field] });
      if (!res.error) router.refresh();
    });
  }

  const awaitingPayment = items.filter((i) => !i.payment_received);
  const toShip = items.filter((i) => !i.shipped);
  const awaitingTotal = awaitingPayment.reduce(
    (sum, i) => sum + (i.sale_payout === null ? 0 : Number(i.sale_payout)),
    0
  );

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">
      <Section
        title="Awaiting payment"
        items={awaitingPayment}
        field="payment_received"
        actionLabel="Mark payment received"
        pending={pending}
        bundleMeta={bundleMeta}
        onToggle={toggle}
        total={awaitingTotal}
      />
      <Section
        title="To ship"
        items={toShip}
        field="shipped"
        actionLabel="Mark shipped"
        pending={pending}
        bundleMeta={bundleMeta}
        onToggle={toggle}
      />
    </div>
  );
}
