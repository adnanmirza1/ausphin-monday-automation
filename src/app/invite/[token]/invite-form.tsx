"use client";

import { useActionState } from "react";
import { acceptInvite } from "@/app/actions/auth";

export function InviteForm({ token }: { token: string }) {
  const action = acceptInvite.bind(null, token);
  const [error, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-body">Your name</span>
        <input name="name" required className={inp} placeholder="Full name" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-body">Set a password</span>
        <input name="password" type="password" required className={inp} placeholder="••••••••" />
      </label>
      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-60"
      >
        {pending ? "Joining…" : "Accept & join"}
      </button>
    </form>
  );
}

const inp =
  "rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-teal";
