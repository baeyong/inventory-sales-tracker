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
import MobileSort from "@/components/MobileSort";

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
          className="w-full rounded-md border border-edge px-3 py-1.5 text-sm sm:w-64"
        />
        {search && (
          <span className="text-sm text-muted">
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

      <MobileSort
        options={[
          { key: "name", label: "Name" },
          { key: "amount", label: "Amount" },
          { key: "spent_on", label: "Date" },
          { key: "source", label: "Source" },
        ]}
        activeKey={sortKey}
        dir={sortDir}
        onSort={toggleSort}
      />

      {/* Mobile: stacked cards */}
      <ul className="space-y-3 md:hidden">
        {visible.map((e) => (
          <li
            key={e.id}
            className="rounded-xl border border-line bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/expenses/${e.id}`}
                className="font-medium hover:underline"
              >
                {e.name}
              </Link>
              <span className="shrink-0 font-medium">
                {formatMoney(Number(e.amount))}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
              <span>{formatDate(e.spent_on)}</span>
              {e.source && <span>{e.source}</span>}
            </div>
            {e.notes && (
              <p className="mt-1 text-sm text-muted">{e.notes}</p>
            )}
            <div className="mt-3 flex gap-4">
              <Link
                href={`/expenses/${e.id}`}
                className="text-xs text-muted hover:text-accent hover:underline"
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
                  className="text-xs text-muted hover:text-neg hover:underline"
                >
                  Delete
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-inset text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <SortHeader label="Expense" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <SortHeader label="Date" sortKey="spent_on" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Source" sortKey="source" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((e) => (
              <tr key={e.id} className="bg-surface">
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
                <td className="px-4 py-3 text-muted">
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
                      className="text-xs text-muted hover:text-accent hover:underline"
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
                        className="text-xs text-muted hover:text-neg hover:underline"
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
