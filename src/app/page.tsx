import Link from "next/link";
import { supabaseConfigured } from "@/lib/env";

export default function Home() {
  const configured = supabaseConfigured();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold">📦 Resale Tracker</h1>
        <p className="mt-2 text-muted">
          Track inventory, record sales, and see your profit — for sports cards
          and everything else you flip.
        </p>

        {configured ? (
          <div className="mt-8 flex gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-[18px] py-3 text-[13px] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-surface px-4 py-2.5 text-[13px] font-medium text-ink shadow-pill hover:bg-inset disabled:opacity-50"
            >
              Log in
            </Link>
          </div>
        ) : (
          <div className="mt-8 rounded-[18px] bg-warn-surface p-5 text-[13px]">
            <h2 className="font-semibold text-amber-900 dark:text-amber-200">
              One-time setup needed
            </h2>
            <ol className="mt-2 list-inside list-decimal space-y-2 text-amber-800 dark:text-amber-300">
              <li>
                Create a free project at{" "}
                <a
                  href="https://supabase.com"
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  supabase.com
                </a>
              </li>
              <li>
                In the Supabase dashboard, open <b>SQL Editor</b> and run each
                file in{" "}
                <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">
                  supabase/migrations/
                </code>{" "}
                in order
              </li>
              <li>
                Copy your project URL and anon key from{" "}
                <b>Settings → API</b> into a{" "}
                <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">
                  .env.local
                </code>{" "}
                file:
                <pre className="mt-2 overflow-x-auto rounded-md bg-amber-100 p-3 text-xs dark:bg-amber-900">
                  {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}
                </pre>
              </li>
              <li>Restart the dev server</li>
            </ol>
          </div>
        )}
      </div>
    </main>
  );
}
