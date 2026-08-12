"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteExpense } from "@/app/(app)/actions";
import { formatDate, formatMoney, type Expense } from "@/lib/types";
import {
  sortExpenses,
  type ExpenseSortKey,
  type SortDir,
} from "@/lib/sort";
import SortHeader from "@/components/SortHeader";

export default function ExpensesTable({ expenses }: { expenses: Expense[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<ExpenseSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: ExpenseSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? expenses.filter((e) =>
        [e.name, e.source, e.notes]
          .filter(Boolean)
          .some((s) => (s as string).toLowerCase().includes(q))
      )
    : expenses;
  const visible = sortExpenses(filtered, sortKey, sortDir);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search expenses…"
          className="w-64 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        {search && (
          <span className="text-sm text-zinc-500">
            {visible.length} of {expenses.length} shown
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
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <SortHeader label="Expense" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <SortHeader label="Date" sortKey="spent_on" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Source" sortKey="source" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {visible.map((e) => (
              <tr key={e.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-3">
                  <Link
                    href={`/expenses/${e.id}`}
                    className="font-medium hover:underline"
                  >
                    {e.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right">
                  {formatMoney(Number(e.amount))}
                </td>
                <td className="px-4 py-3">{formatDate(e.spent_on)}</td>
                <td className="px-4 py-3">{e.source ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-500">
                  {e.notes ? (
                    <span className="line-clamp-2">{e.notes}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/expenses/${e.id}`}
                      className="text-xs text-zinc-500 hover:text-blue-600 hover:underline"
                    >
                      Edit
                    </Link>
                    <form
                      action={deleteExpense}
                      onSubmit={(ev) => {
                        if (!confirm(`Delete "${e.name}"?`)) ev.preventDefault();
                      }}
                    >
                      <input type="hidden" name="id" value={e.id} />
                      <button
                        type="submit"
                        className="text-xs text-zinc-500 hover:text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
