"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";

export function LoginForm() {
  const [error, action, pending] = useActionState(loginAction, null);

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-body">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue="adnan.mustafa@toptal.com"
          className="rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-teal"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-body">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          defaultValue="password"
          className="rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-teal"
        />
      </label>

      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <button
        type="button"
        disabled
        title="Google sign-in — connect credentials to enable"
        className="flex items-center justify-center gap-2 rounded-lg border border-hair bg-white px-4 py-2.5 text-sm font-medium text-muted"
      >
        <span className="font-mono">G</span> Continue with Google
        <span className="text-[10px] uppercase tracking-wide">soon</span>
      </button>
    </form>
  );
}
