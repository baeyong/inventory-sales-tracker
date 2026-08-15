"use client";

import { useActionState } from "react";
import { updatePassword } from "../actions";

const inputCls =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950";

export default function UpdatePasswordPage() {
  const [state, action, pending] = useActionState(updatePassword, null);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold">Set a new password</h1>
        <p className="mt-1 text-sm text-zinc-500">
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
            <p className="text-sm text-red-600 dark:text-red-400">
              {state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save new password"}
          </button>
        </form>
      </div>
    </main>
  );
}
