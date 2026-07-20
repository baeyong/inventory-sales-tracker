import ImportClient from "@/components/ImportClient";

export const metadata = { title: "Import · Resale Tracker" };

export default function ImportPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Import from spreadsheet</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-500">
        Upload an Excel or CSV file with your existing inventory and sales —
        any column names work. We&apos;ll guess what each column means and let
        you confirm the matches before anything is imported. Only a name and a
        purchase price column are required. Your matches are remembered, so
        re-importing the same kind of sheet skips straight through.
      </p>
      <div className="mt-6">
        <ImportClient />
      </div>
    </div>
  );
}
