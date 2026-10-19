"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "../actions";

// useSearchParams opts this subtree out of prerendering, so it needs its own
// Suspense boundary or the static build of /login fails.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);
  // Set when an emailed link was expired or already used.
  const linkError = useSearchParams().get("error");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="disp text-[26px] font-bold">Log in</h1>
        <p className="mt-1 text-sm text-muted">
          Track your inventory and sales in one place.
        </p>
        <form action={action} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="font-medium">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="mt-1.5 w-full rounded-[10px] border border-edge bg-surface px-3 py-2.5 text-[13px] text-ink placeholder:text-muted"
            />
          </label>
          <label className="block text-sm">
            <span className="flex items-center justify-between">
              <span className="font-medium">Password</span>
              <Link
                href="/forgot-password"
                className="text-xs font-normal text-accent hover:underline"
              >
                Forgot password?
              </Link>
            </span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-[10px] border border-edge bg-surface px-3 py-2.5 text-[13px] text-ink placeholder:text-muted"
            />
          </label>
          {(state?.error ?? linkError) && (
            <p className="text-sm text-neg">
              {state?.error ?? linkError}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent px-[18px] py-3 text-[13px] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Logging in…" : "Log in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          No account?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
