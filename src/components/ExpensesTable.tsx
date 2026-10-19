"use client";

import { useState, type ReactNode } from "react";
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
import { SearchCount, SearchField, ToolbarRow } from "@/components/Toolbar";
import { btnRow, emptyState, td, th } from "@/lib/ui";

export default function ExpensesTable({
  expenses,
  action,
  empty,
}: {
  expenses: Expense[];
  /** The page's main button, at the end of the toolbar. */
  action?: ReactNode;
  empty?: ReactNode;
}) {
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

  const deleteForm = (e: Expense, cls: string) => (
    <form
      action={deleteExpense}
      onSubmit={(ev) => {
        if (!confirm(`Delete "${e.name}"?`)) ev.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={e.id} />
      <button type="submit" className={cls}>
        Delete
      </button>
    </form>
  );

  return (
    <div className="flex flex-col gap-4">
      <ToolbarRow>
        <SearchField value={search} onChange={setSearch} placeholder="Search expenses…" />
        {search && (
          <SearchCount
            shown={visible.length}
            total={expenses.length}
            onClear={() => setSearch("")}
          />
        )}
        <span className="grow" />
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
        <>{action}</>
      </ToolbarRow>

      {expenses.length === 0 ? (
        <div className={emptyState}>{empty}</div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {visible.map((e) => (
              <li key={e.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/expenses/${e.id}`} className="font-semibold hover:underline">
                    {e.name}
                  </Link>
                  <span className="disp tnum shrink-0 font-bold">
                    {formatMoney(Number(e.amount))}
                  </span>
                </div>
                <div className="cap tnum mt-1">
                  {[formatDate(e.spent_on), e.source].filter(Boolean).join(" · ")}
                </div>
                {e.notes && <p className="mt-1.5 text-[13px] text-ink-2">{e.notes}</p>}
                <div className="mt-3 flex gap-2">
                  <Link href={`/expenses/${e.id}`} className={btnRow}>
                    Edit
                  </Link>
                  {deleteForm(e, btnRow)}
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-inset">
                    <SortHeader label="Expense" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} className="pl-5" />
                    <SortHeader label="Date" sortKey="spent_on" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Source" sortKey="source" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                    <th className={`${th} pr-5`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.id}>
                      <td className={`${td} pl-5`}>
                        <Link href={`/expenses/${e.id}`} className="font-semibold hover:underline">
                          {e.name}
                        </Link>
                        {e.notes && (
                          <div className="cap mt-0.5 line-clamp-1">{e.notes}</div>
                        )}
                      </td>
                      <td className={`${td} tnum text-ink-2`}>{formatDate(e.spent_on)}</td>
                      <td className={`${td} text-ink-2`}>{e.source ?? "—"}</td>
                      <td className={`${td} disp tnum text-right text-[15px] font-bold`}>
                        {formatMoney(Number(e.amount))}
                      </td>
                      <td className={`${td} pr-5`}>
                        <div className="flex justify-end gap-1.5">
                          <Link href={`/expenses/${e.id}`} className={btnRow}>
                            Edit
                          </Link>
                          {deleteForm(e, btnRow)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
