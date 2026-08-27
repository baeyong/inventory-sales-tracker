"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkSetFulfillment, updateFulfillment } from "@/app/(app)/actions";
import { formatDate, formatMoney, type Item } from "@/lib/types";
import { buildBundleMeta, groupBundles, type BundleMeta } from "@/lib/bundles";

type Field = "payment_received" | "shipped";

function Detail({ item }: { item: Item }) {
  return (
    <span className="block text-xs text-zinc-500">
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
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          {total !== undefined && items.length > 0 && (
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {formatMoney(total)}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              items.length === 0
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            {items.length === 0 ? "All done" : items.length}
          </span>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-500">Nothing waiting. 🎉</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
                className={`flex items-start gap-3 px-4 py-3 text-sm ${
                  showBundle ? `border-l-4 ${meta!.color.stripe}` : ""
                }`}
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
                  className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
                />
                <div className="min-w-0 flex-1">
                  {showBundle && (
                    <span
                      className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta!.color.badge}`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${meta!.color.dot}`}
                      />
                      Bundle {meta!.num} · {members.length} items
                    </span>
                  )}
                  {members.map((m) => (
                    <div key={m.id} className={showBundle ? "mt-0.5" : ""}>
                      <Link
                        href={`/inventory/${m.id}`}
                        className="font-medium hover:underline"
                      >
                        {m.name}
                      </Link>
                      <Detail item={m} />
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Section
        title="💰 Awaiting payment"
        items={awaitingPayment}
        field="payment_received"
        actionLabel="Mark payment received"
        pending={pending}
        bundleMeta={bundleMeta}
        onToggle={toggle}
        total={awaitingTotal}
      />
      <Section
        title="📦 To ship"
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
