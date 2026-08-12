"use client";

import { useState } from "react";
import { exportItems, listExpenses } from "@/app/(app)/actions";
import { buildTaxCsv } from "@/lib/taxReport";

// Human-friendly column order for the CSV; any extra fields are appended.
const CSV_COLUMNS = [
  "name",
  "category",
  "purchase_price",
  "purchase_date",
  "purchase_platform",
  "quantity",
  "listed",
  "card_set",
  "card_number",
  "player",
  "condition",
  "grade_company",
  "grade",
  "sale_date",
  "sale_platform",
  "sale_payout",
  "buyer",
  "payment_received",
  "shipped",
  "bundle_id",
  "opened_at",
  "market_platform",
  "market_search",
  "description",
  "created_at",
  "updated_at",
  "id",
];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  const extra = rows.length
    ? Object.keys(rows[0]).filter(
        (k) => !CSV_COLUMNS.includes(k) && k !== "user_id"
      )
    : [];
  const cols = [...CSV_COLUMNS, ...extra];
  const lines = [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")),
  ];
  // BOM so Excel reads UTF-8 (é, ®) correctly; CRLF line endings.
  return "﻿" + lines.join("\r\n");
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function BackupButtons() {
  const [busy, setBusy] = useState<"csv" | "json" | "tax" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "csv" | "json" | "tax") {
    setBusy(kind);
    setError(null);
    setStatus(null);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "tax") {
        const [rows, expenses] = await Promise.all([
          exportItems(),
          listExpenses(),
        ]);
        download(
          `tax-summary-${stamp}.csv`,
          buildTaxCsv(rows, expenses),
          "text/csv"
        );
        setStatus(
          `Saved tax summary — ${rows.length} item${rows.length === 1 ? "" : "s"}, ${expenses.length} expense${expenses.length === 1 ? "" : "s"}.`
        );
        return;
      }
      if (kind === "json") {
        // Complete, restorable snapshot: everything you own, both tables.
        const [items, expenses] = await Promise.all([
          exportItems(),
          listExpenses(),
        ]);
        const snapshot = { version: 1, exported_at: stamp, items, expenses };
        download(
          `resale-backup-${stamp}.json`,
          JSON.stringify(snapshot, null, 2),
          "application/json"
        );
        setStatus(
          `Saved ${items.length} item${items.length === 1 ? "" : "s"}, ${expenses.length} expense${expenses.length === 1 ? "" : "s"}.`
        );
        return;
      }
      const rows = await exportItems();
      download(`resale-backup-${stamp}.csv`, toCsv(rows), "text/csv");
      setStatus(`Saved ${rows.length} item${rows.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => run("csv")}
        disabled={busy !== null}
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {busy === "csv" ? "Preparing…" : "Download CSV"}
      </button>
      <button
        type="button"
        onClick={() => run("json")}
        disabled={busy !== null}
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {busy === "json" ? "Preparing…" : "Download JSON"}
      </button>
      <button
        type="button"
        onClick={() => run("tax")}
        disabled={busy !== null}
        className="rounded-md border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950"
      >
        {busy === "tax" ? "Preparing…" : "Tax summary (CSV)"}
      </button>
      {status && (
        <span className="text-sm text-emerald-600 dark:text-emerald-400">
          {status}
        </span>
      )}
      {error && (
        <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}
