"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { restoreBackup } from "@/app/(app)/actions";

export default function RestoreButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again
    if (!file) return;

    setError(null);
    setStatus(null);

    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      setError("That file isn't valid JSON — pick a Download-JSON backup.");
      return;
    }

    const p = payload as { items?: unknown[]; expenses?: unknown[] };
    const itemsN = Array.isArray(payload)
      ? payload.length
      : Array.isArray(p?.items)
        ? p.items.length
        : 0;
    const expN = Array.isArray(p?.expenses) ? p.expenses.length : 0;

    if (itemsN === 0 && expN === 0) {
      setError("No items or expenses found in that file.");
      return;
    }
    if (
      !confirm(
        `Restore ${itemsN} item${itemsN === 1 ? "" : "s"} and ${expN} expense${expN === 1 ? "" : "s"} from this backup?\n\n` +
          "Records with the same id are overwritten; new ones are added. Nothing is deleted."
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const res = await restoreBackup(payload);
      if (res.error) {
        setError(res.error);
      } else {
        setStatus(
          `Restored ${res.items ?? 0} item${res.items === 1 ? "" : "s"} and ${res.expenses ?? 0} expense${res.expenses === 1 ? "" : "s"}.`
        );
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={onFile}
        className="hidden"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {busy ? "Restoring…" : "Restore from JSON…"}
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
