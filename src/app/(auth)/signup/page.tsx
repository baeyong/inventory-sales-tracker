"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "../actions";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signUp, null);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="disp text-[26px] font-bold">Create account</h1>
        <p className="mt-1 text-sm text-muted">
          Your inventory is private to your account.
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
            <span className="font-medium">Password</span>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-[10px] border border-edge bg-surface px-3 py-2.5 text-[13px] text-ink placeholder:text-muted"
            />
          </label>
          {state?.error && (
            <p className="text-sm text-neg">
              {state.error}
            </p>
          )}
          {state?.message && (
            <p className="text-sm text-pos">
              {state.message}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent px-[18px] py-3 text-[13px] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
