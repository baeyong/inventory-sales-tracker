"use client";

import { buildCogsCsv, type CogsReport } from "@/lib/cogs";
import { btnSecondary } from "@/lib/ui";

export default function CogsCsvButton({ report }: { report: CogsReport }) {
  return (
    <button
      type="button"
      className={btnSecondary}
      onClick={() => {
        const blob = new Blob([buildCogsCsv(report)], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cogs-${report.year}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }}
    >
      Download CSV
    </button>
  );
}
