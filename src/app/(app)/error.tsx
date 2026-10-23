"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { btnPrimary } from "@/lib/ui";

// Shown when a signed-in page can't load its data (Supabase down, a dropped
// connection, an expired session). Without it a failed query looked like an
// empty inventory or $0 dashboard. The layout above stays, so the header and
// nav are still there.
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card mt-6 p-10 text-center">
      <h2 className="disp mb-2 text-lg font-bold">
        Couldn&apos;t load your data
      </h2>
      <p className="mx-auto mb-6 max-w-md text-sm text-muted">
        Your items are safe — this is a connection problem, not lost data. Try
        again in a moment.
      </p>
      <button type="button" className={btnPrimary} onClick={() => unstable_retry()}>
        Try again
      </button>
    </div>
  );
}
