import BackupButtons from "@/components/BackupButtons";
import RestoreButton from "@/components/RestoreButton";
import ImportClient from "@/components/ImportClient";

export const metadata = { title: "Data · Resale Tracker" };

export default function DataPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Data</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Back up everything, pull a tax summary, or import an existing
          spreadsheet.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-semibold">Export &amp; backup</h2>
        <p className="mb-4 mt-1 max-w-2xl text-sm text-zinc-500">
          Download a copy of everything to your computer. CSV/JSON are complete
          snapshots — keep one somewhere safe like Google Drive.{" "}
          <span className="font-medium">Tax summary</span> is an
          accountant-friendly report: totals and a by-year breakdown of
          proceeds, profit, ripped cost, and expenses, plus clean line items.
        </p>
        <BackupButtons />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-semibold">Restore from backup</h2>
        <p className="mb-4 mt-1 max-w-2xl text-sm text-zinc-500">
          Rebuild from a <span className="font-medium">Download JSON</span> file
          — it re-creates every item and expense exactly, ripped status and
          bundles included. Safe to re-run: records with the same id are
          overwritten and new ones added, nothing is deleted. (For messy
          spreadsheets from elsewhere, use Import below instead.)
        </p>
        <RestoreButton />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-semibold">Import from spreadsheet</h2>
        <p className="mb-4 mt-1 max-w-2xl text-sm text-zinc-500">
          Upload an Excel or CSV file with your existing inventory and sales —
          any column names work. We&apos;ll guess what each column means and let
          you confirm the matches before anything is imported. Only a name and a
          purchase price column are required. Your matches are remembered, so
          re-importing the same kind of sheet skips straight through.
        </p>
        <ImportClient />
      </section>
    </div>
  );
}
