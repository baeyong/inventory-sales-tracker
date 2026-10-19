"use client";

import { useActionState } from "react";
import { updatePassword } from "../actions";

const inputCls =
  "mt-1.5 w-full rounded-[10px] border border-edge bg-surface px-3 py-2.5 text-[13px] text-ink placeholder:text-muted";

export default function UpdatePasswordPage() {
  const [state, action, pending] = useActionState(updatePassword, null);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="disp text-[26px] font-bold">Set a new password</h1>
        <p className="mt-1 text-sm text-muted">
          At least 6 characters. You&rsquo;ll be logged in once it&rsquo;s saved.
        </p>
        <form action={action} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="font-medium">New password</span>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              autoComplete="new-password"
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Confirm new password</span>
            <input
              type="password"
              name="confirm"
              required
              minLength={6}
              autoComplete="new-password"
              className={inputCls}
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
            {pending ? "Saving…" : "Save new password"}
          </button>
        </form>
      </div>
    </main>
  );
}
