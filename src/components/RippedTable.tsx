"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkMarkUnopened } from "@/app/(app)/actions";
import { formatDate, formatMoney, isCardCategory, type Item } from "@/lib/types";
import { matchesSearch } from "@/lib/search";

export default function RippedTable({ items }: { items: Item[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = items.filter((i) => matchesSearch(i, search));

  function undo(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await bulkMarkUnopened([id]);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search opened product…"
          className="w-64 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        {search && (
          <span className="text-sm text-zinc-500">
            {visible.length} of {items.length} shown
            {" · "}
            <button
              type="button"
              onClick={() => setSearch("")}
              className="hover:underline"
            >
              clear
            </button>
          </span>
        )}
        {error && (
          <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Bought at</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3">Opened</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {visible.map((item) => (
              <tr key={item.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-3">
                  <Link
                    href={`/inventory/${item.id}`}
                    className="font-medium hover:underline"
                  >
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                      isCardCategory(item.category)
                        ? "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {item.category}
                  </span>
                </td>
                <td className="px-4 py-3">{item.purchase_platform ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  {formatMoney(Number(item.purchase_price))}
                </td>
                <td className="px-4 py-3">{formatDate(item.opened_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    title="Move back to inventory (unopened)"
                    disabled={pending}
                    onClick={() => undo(item.id)}
                    className="text-xs text-zinc-500 hover:text-blue-600 hover:underline disabled:opacity-50"
                  >
                    Back to inventory
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
