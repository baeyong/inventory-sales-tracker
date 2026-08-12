"use client";

import { useState } from "react";
import { exportItems, listExpenses } from "@/app/(app)/actions";
import { buildTaxCsv } from "@/lib/taxReport";

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
  const [busy, setBusy] = useState<"json" | "tax" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "json" | "tax") {
    setBusy(kind);
    setError(null);
    setStatus(null);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const [items, expenses] = await Promise.all([
        exportItems(),
        listExpenses(),
      ]);
      if (kind === "json") {
        // Complete, restorable snapshot: everything you own, both tables.
        const snapshot = { version: 1, exported_at: stamp, items, expenses };
        download(
          `resale-backup-${stamp}.json`,
          JSON.stringify(snapshot, null, 2),
          "application/json"
        );
      } else {
        download(
          `tax-summary-${stamp}.csv`,
          buildTaxCsv(items, expenses),
          "text/csv"
        );
      }
      setStatus(
        `Saved ${items.length} item${items.length === 1 ? "" : "s"}, ${expenses.length} expense${expenses.length === 1 ? "" : "s"}.`
      );
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
        onClick={() => run("json")}
        disabled={busy !== null}
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {busy === "json" ? "Preparing…" : "Download JSON (backup)"}
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
