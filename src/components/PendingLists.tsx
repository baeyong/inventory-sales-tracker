"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkSetFulfillment, updateFulfillment } from "@/app/(app)/actions";
import { formatDate, formatMoney, type Item } from "@/lib/types";

function Section({
  title,
  items,
  field,
  actionLabel,
  pending,
  onToggle,
}: {
  title: string;
  items: Item[];
  field: "payment_received" | "shipped";
  actionLabel: string;
  pending: boolean;
  onToggle: (item: Item, field: "payment_received" | "shipped") => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <h2 className="font-semibold">{title}</h2>
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
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-500">Nothing waiting. 🎉</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={false}
                  disabled={pending}
                  onChange={() => onToggle(item, field)}
                  aria-label={`${actionLabel}: ${item.name}`}
                  className="h-5 w-5 shrink-0 accent-emerald-600"
                />
                <span className="min-w-0">
                  <Link
                    href={`/inventory/${item.id}`}
                    className="font-medium hover:underline"
                  >
                    {item.name}
                  </Link>
                  <span className="block text-xs text-zinc-500">
                    Sold {formatDate(item.sale_date)}
                    {item.sale_platform && <> · on {item.sale_platform}</>}
                    {item.purchase_platform && <> · from {item.purchase_platform}</>}
                    {item.sale_payout !== null && (
                      <> · {formatMoney(Number(item.sale_payout))}</>
                    )}
                    {item.buyer && <> · to {item.buyer}</>}
                    {item.bundle_id && (
                      <span className="ml-1 rounded-full bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        Bundle
                      </span>
                    )}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PendingLists({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(item: Item, field: "payment_received" | "shipped") {
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

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Section
        title="💰 Awaiting payment"
        items={awaitingPayment}
        field="payment_received"
        actionLabel="Mark payment received"
        pending={pending}
        onToggle={toggle}
      />
      <Section
        title="📦 To ship"
        items={toShip}
        field="shipped"
        actionLabel="Mark shipped"
        pending={pending}
        onToggle={toggle}
      />
    </div>
  );
}
