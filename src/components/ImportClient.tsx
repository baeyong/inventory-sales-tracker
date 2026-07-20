"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { importItems, listItemsForImport } from "@/app/(app)/actions";
import {
  FIELD_LABELS,
  MAPPABLE_FIELDS,
  buildRows,
  detectHeaderRow,
  generateQuestions,
  guessMapping,
  headerSignature,
  matchImportRows,
  toText,
  type ColumnMap,
  type Confidence,
  type MappableField,
  type MappingQuestion,
  type MatchCandidate,
  type ParsedSheet,
} from "@/lib/importMapping";
import { formatMoney } from "@/lib/types";

type Parsed = ParsedSheet & {
  fileName: string;
  samples: unknown[][]; // up to 3 non-empty values per column
};

const TEMPLATE_HEADERS = [
  "Name",
  "Type",
  "Description",
  "Purchase Price",
  "Purchase Date",
  "Bought At",
  "Quantity",
  "Set",
  "Card Number",
  "Player",
  "Condition",
  "Grade Company",
  "Grade",
  "Sale Date",
  "Sale Platform",
  "Sale Payout",
  "Payment",
  "Shipped",
  "Listed",
];

// v2: bumped to abandon mappings saved by earlier importer versions (before
// the status field / payout-unknown model) — stale ones silently skip the chat.
const MAPPING_STORE_PREFIX = "resale-tracker.import-mapping.v2.";

function sampleText(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length > 24 ? s.slice(0, 24) + "…" : s;
}

function loadSavedMapping(signature: string, width: number): ColumnMap | null {
  try {
    const raw = localStorage.getItem(MAPPING_STORE_PREFIX + signature);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== width) return null;
    return parsed.map((f) =>
      MAPPABLE_FIELDS.includes(f as MappableField) ? (f as MappableField) : null
    );
  } catch {
    return null;
  }
}

function saveMapping(signature: string, mapping: ColumnMap) {
  try {
    localStorage.setItem(
      MAPPING_STORE_PREFIX + signature,
      JSON.stringify(mapping)
    );
  } catch {
    // Storage full or blocked — remembering the mapping is best-effort.
  }
}

export default function ImportClient() {
  const router = useRouter();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ColumnMap>([]);
  const [confidence, setConfidence] = useState<Confidence[]>([]);
  const [questions, setQuestions] = useState<MappingQuestion[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [chatLog, setChatLog] = useState<
    { question: string; answer: string }[]
  >([]);
  const [stage, setStage] = useState<"pick" | "chat" | "map" | "preview">(
    "pick"
  );
  const [candidates, setCandidates] = useState<MatchCandidate[] | null>(null);
  const [inventoryOnly, setInventoryOnly] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleFile(file: File | undefined) {
    setFileError(null);
    setServerError(null);
    setInventoryOnly(false);
    if (!file) return;
    try {
      // CSVs: let the browser decode UTF-8 and pass text — sheetjs's own
      // codepage tables aren't bundled, so byte input garbles non-ASCII.
      // raw keeps CSV text as-is: "1/11" must reach our date parser, not
      // become a year-2001 Date via sheetjs's guessing.
      const isCsv =
        file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
      const wb = isCsv
        ? XLSX.read(await file.text(), {
            type: "string",
            cellDates: true,
            raw: true,
          })
        : XLSX.read(await file.arrayBuffer(), { cellDates: true, raw: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        defval: null,
      });

      const headerIdx = detectHeaderRow(grid);
      const headers = (grid[headerIdx] ?? []).map((h) => toText(h) ?? "");
      const rows = grid.slice(headerIdx + 1);
      if (headers.every((h) => h === "") || rows.length === 0) {
        setFileError("That file has no header row or no data rows.");
        return;
      }
      const samples = headers.map((_, i) =>
        rows
          .map((r) => r[i])
          .filter((v) => v !== null && v !== undefined && v !== "")
          .slice(0, 3)
      );
      const p: Parsed = { fileName: file.name, headers, rows, samples };

      const saved = loadSavedMapping(headerSignature(headers), headers.length);
      setChatLog([]);
      setQIdx(0);
      if (saved) {
        setMapping(saved);
        setConfidence(headers.map(() => "exact"));
        setQuestions([]);
        setParsed(p);
        setStage("map");
      } else {
        const guesses = guessMapping(headers, samples);
        setMapping(guesses.map((g) => g.field));
        setConfidence(guesses.map((g) => g.confidence));
        const qs = generateQuestions(headers, samples, guesses);
        setQuestions(qs);
        setParsed(p);
        setStage(qs.length > 0 ? "chat" : "map");
      }
    } catch {
      setFileError("Couldn't read that file. Use .xlsx, .xls, or .csv.");
    }
  }

  function assign(colIdx: number, value: string) {
    const field = value === "" ? null : (value as MappableField);
    setMapping((prev) =>
      prev.map((f, i) => {
        if (i === colIdx) return field;
        return field !== null && f === field ? null : f; // one column per field
      })
    );
    setConfidence((prev) => prev.map((c, i) => (i === colIdx ? "exact" : c)));
  }

  function answerQuestion(option: MappingQuestion["options"][number]) {
    const q = questions[qIdx];
    if (!q) return;
    assign(q.colIdx, option.field ?? "");
    setChatLog((prev) => [
      ...prev,
      { question: q.question, answer: option.label },
    ]);
    if (qIdx + 1 >= questions.length) {
      setStage("map");
    } else {
      setQIdx(qIdx + 1);
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEADERS,
      [
        "2018 Luka Doncic Prizm #280",
        "card",
        "",
        24.5,
        "2025-11-02",
        "eBay",
        1,
        "2018-19 Panini Prizm",
        "280",
        "Luka Doncic",
        "graded",
        "PSA",
        "9",
        "2026-02-10",
        "eBay",
        40,
        "Yes",
        "Yes",
      ],
      ["Vintage lamp", "general", "Estate sale find", 12, "2026-01-15", "Estate sale", 1],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items");
    XLSX.writeFile(wb, "resale-tracker-template.xlsx");
  }

  const hasName = mapping.includes("name");
  const hasPrice = mapping.includes("purchase_price");
  const builtAll =
    parsed && stage === "preview" ? buildRows(parsed, mapping) : null;
  const built =
    builtAll && inventoryOnly
      ? { ...builtAll, rows: builtAll.rows.filter((r) => r.sale_date === null) }
      : builtAll;
  const soldExcluded =
    builtAll && built ? builtAll.rows.length - built.rows.length : 0;
  const dispositions =
    built && candidates ? matchImportRows(built.rows, candidates) : null;
  const linkCount =
    dispositions?.filter((d) => d.kind === "update").length ?? 0;
  const dupCount =
    dispositions?.filter((d) => d.kind === "duplicate").length ?? 0;

  async function goToPreview() {
    if (!parsed) return;
    saveMapping(headerSignature(parsed.headers), mapping);
    setStage("preview");
    try {
      setCandidates(await listItemsForImport());
    } catch {
      setCandidates([]); // preview shows no links; the server still matches
    }
  }

  function submit() {
    if (!built || built.rows.length === 0) return;
    setServerError(null);
    startTransition(async () => {
      const res = await importItems(built.rows);
      if (res.error) {
        setServerError(res.error);
      } else {
        const anySales = built.rows.some((r) => r.sale_date !== null);
        router.push(anySales ? "/sales" : "/inventory");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          {parsed ? "Choose a different file" : "Choose file"}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={downloadTemplate}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Download template
        </button>
        {parsed && (
          <span className="text-sm text-zinc-500">
            {parsed.fileName} · {parsed.rows.length} rows
          </span>
        )}
      </div>

      {fileError && (
        <p className="text-sm text-red-600 dark:text-red-400">{fileError}</p>
      )}

      {parsed && stage === "chat" && questions[qIdx] && (
        <div className="max-w-2xl space-y-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500">
              I matched{" "}
              {parsed.headers.length - questions.length} of{" "}
              {parsed.headers.length} columns automatically — a few need your
              help ({qIdx + 1} of {questions.length}):
            </p>

            {chatLog.map((entry, i) => (
              <div key={i} className="mt-3 space-y-2">
                <div className="max-w-[85%] rounded-lg rounded-bl-none bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">
                  {entry.question}
                </div>
                <div className="ml-auto w-fit max-w-[85%] rounded-lg rounded-br-none bg-blue-600 px-3 py-2 text-sm text-white">
                  {entry.answer}
                </div>
              </div>
            ))}

            <div className="mt-3 max-w-[85%] rounded-lg rounded-bl-none bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">
              <p>{questions[qIdx].question}</p>
              {parsed.samples[questions[qIdx].colIdx].length > 0 && (
                <p className="mt-1 text-xs text-zinc-500">
                  Sample values:{" "}
                  {parsed.samples[questions[qIdx].colIdx]
                    .map(sampleText)
                    .join(" · ")}
                </p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {questions[qIdx].options.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => answerQuestion(opt)}
                  className="rounded-full border border-blue-600 px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-600 hover:text-white dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStage("map")}
            className="text-sm text-zinc-500 hover:underline"
          >
            Skip the questions — I&apos;ll match columns myself
          </button>
        </div>
      )}

      {parsed && stage === "map" && (
        <div className="space-y-4">
          <div>
            <h2 className="font-semibold">Match your columns</h2>
            <p className="mt-1 text-sm text-zinc-500">
              We guessed where each column belongs — fix anything that&apos;s
              wrong.{" "}
              <span className="rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                highlighted
              </span>{" "}
              guesses are uncertain. Columns set to &quot;Ignore&quot; are
              skipped.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-3">Your column</th>
                  <th className="px-4 py-3">Sample values</th>
                  <th className="px-4 py-3">Imports as</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {parsed.headers.map((h, i) => (
                  <tr key={i} className="bg-white dark:bg-zinc-950">
                    <td className="px-4 py-2 font-medium">
                      {h || <span className="text-zinc-400">(untitled)</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {parsed.samples[i].map(sampleText).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={mapping[i] ?? ""}
                        onChange={(e) => assign(i, e.target.value)}
                        className={`w-full max-w-56 rounded-md border px-2 py-1.5 text-sm dark:bg-zinc-950 ${
                          mapping[i] !== null && confidence[i] === "low"
                            ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
                            : "border-zinc-300 dark:border-zinc-700"
                        }`}
                      >
                        <option value="">Ignore</option>
                        {MAPPABLE_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {FIELD_LABELS[f]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(!hasName || !hasPrice) && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Map a column to {!hasName && <b>{FIELD_LABELS.name}</b>}
              {!hasName && !hasPrice && " and "}
              {!hasPrice && <b>{FIELD_LABELS.purchase_price}</b>} to continue.
            </p>
          )}

          <button
            type="button"
            disabled={!hasName || !hasPrice}
            onClick={goToPreview}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Continue to preview
          </button>
        </div>
      )}

      {parsed && stage === "preview" && built && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="font-semibold">Preview</h2>
            <button
              type="button"
              onClick={() => setStage("map")}
              className="text-sm text-blue-600 hover:underline"
            >
              ← Back to column matching
            </button>
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={inventoryOnly}
                onChange={(e) => setInventoryOnly(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              Inventory only
              {soldExcluded > 0 && ` (skipping ${soldExcluded} sold rows)`}
            </label>
          </div>

          {built.statusSkipped > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {built.statusSkipped} row{built.statusSkipped === 1 ? "" : "s"}{" "}
              {built.statusSkipped === 1 ? "was" : "were"} skipped: returned
              items, or rows marked sold with no usable sale date.
            </div>
          )}

          {built.errors.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <p className="font-medium">
                {built.errors.length} row{built.errors.length === 1 ? "" : "s"}{" "}
                will be skipped:
              </p>
              <ul className="mt-1 list-inside list-disc">
                {built.errors.slice(0, 10).map((e) => (
                  <li key={e}>{e}</li>
                ))}
                {built.errors.length > 10 && (
                  <li>…and {built.errors.length - 10} more</li>
                )}
              </ul>
            </div>
          )}

          {built.rows.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No importable rows with this mapping — check the column matching.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                    <tr>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {built.rows.slice(0, 20).map((r, i) => {
                      const d = dispositions?.[i];
                      return (
                        <tr key={i} className="bg-white dark:bg-zinc-950">
                          <td className="px-4 py-2">{r.name}</td>
                          <td className="px-4 py-2">
                            {r.category}
                          </td>
                          <td className="px-4 py-2 text-right">{r.quantity}</td>
                          <td className="px-4 py-2 text-right">
                            {formatMoney(r.purchase_price)}
                          </td>
                          <td className="px-4 py-2">
                            {r.sale_date
                              ? `Sold ${r.sale_date} · ${
                                  r.sale_payout === null
                                    ? "payout unknown"
                                    : formatMoney(r.sale_payout)
                                }`
                              : "In inventory"}
                            {d?.kind === "update" && (
                              <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                updates existing item
                              </span>
                            )}
                            {d?.kind === "duplicate" && (
                              <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                already in inventory — skipped
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {built.rows.length > 20 && (
                      <tr className="bg-white dark:bg-zinc-950">
                        <td colSpan={5} className="px-4 py-2 text-zinc-500">
                          …and {built.rows.length - 20} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {serverError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {serverError}
                </p>
              )}

              {(linkCount > 0 || dupCount > 0) && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {built.rows.length - linkCount - dupCount} new item
                  {built.rows.length - linkCount - dupCount === 1 ? "" : "s"}
                  {linkCount > 0 &&
                    ` · ${linkCount} existing item${linkCount === 1 ? "" : "s"} will be marked sold`}
                  {dupCount > 0 &&
                    ` · ${dupCount} duplicate${dupCount === 1 ? "" : "s"} skipped`}
                </p>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pending
                  ? "Importing…"
                  : `Import ${built.rows.length} item${built.rows.length === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
