import BackupButtons from "@/components/BackupButtons";
import RestoreButton from "@/components/RestoreButton";
import ImportClient from "@/components/ImportClient";
import PageHero from "@/components/PageHero";

export const metadata = { title: "Data · Resale Tracker" };

export default function DataPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHero
        title="Data"
        description="Back up everything, pull a tax summary, or import an existing spreadsheet."
      />

      <section className="card px-6 py-[22px]">
        <h2 className="disp text-[15px] font-bold">Export &amp; backup</h2>
        <p className="mb-4 mt-1.5 max-w-2xl text-[13px] text-muted">
          <span className="font-medium">Download JSON</span> is your real
          backup — a complete snapshot of everything (items and expenses) that
          Restore below can rebuild exactly. Keep a copy somewhere safe like
          Google Drive.{" "}
          <span className="font-medium">Tax summary</span> is a readable report
          for your accountant: totals and a by-year breakdown of proceeds,
          profit, ripped cost, and expenses, plus clean line items.
        </p>
        <BackupButtons />
      </section>

      <section className="card px-6 py-[22px]">
        <h2 className="disp text-[15px] font-bold">Restore from backup</h2>
        <p className="mb-4 mt-1.5 max-w-2xl text-[13px] text-muted">
          Rebuild from a <span className="font-medium">Download JSON</span> file
          — it re-creates every item and expense exactly, ripped status and
          bundles included. Safe to re-run: records with the same id are
          overwritten and new ones added, nothing is deleted. (For messy
          spreadsheets from elsewhere, use Import below instead.)
        </p>
        <RestoreButton />
      </section>

      <section className="card px-6 py-[22px]">
        <h2 className="disp text-[15px] font-bold">Import from spreadsheet</h2>
        <p className="mb-4 mt-1.5 max-w-2xl text-[13px] text-muted">
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
