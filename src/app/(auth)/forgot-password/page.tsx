"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="disp text-[26px] font-bold">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">
          We&rsquo;ll email you a link to set a new one.
        </p>
        {state?.message ? (
          <p className="mt-6 rounded-[14px] bg-pos-surface p-4 text-[13px] text-pos">
            {state.message}
          </p>
        ) : (
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
            {state?.error && (
              <p className="text-sm text-neg">
                {state.error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent px-[18px] py-3 text-[13px] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/login" className="text-accent hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
