"use client";

import { useEffect, useState, useTransition } from "react";
import { getOrgSenders, setOrgSenders } from "@/app/actions/email";

// Requirement #1 — manage the org's approved "From" addresses once. These feed
// the email composer's From dropdown for everyone in the org.
export function SenderSettings({ smtpFrom }: { smtpFrom: string | null }) {
  const [senders, setSenders] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    getOrgSenders()
      .then((list) => setSenders(list))
      .catch(() => setErr("Could not load approved senders."))
      .finally(() => setLoaded(true));
  }, []);

  function persist(next: string[]) {
    setErr(null);
    setMsg(null);
    start(async () => {
      const res = await setOrgSenders(next);
      if (!res.ok) {
        setErr(res.error ?? "Could not save.");
        return;
      }
      setSenders(res.senders ?? next);
      setMsg("✓ Saved.");
      setTimeout(() => setMsg(null), 1500);
    });
  }

  function add() {
    const a = draft.trim().toLowerCase();
    if (!a) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) {
      setErr(`"${draft.trim()}" is not a valid email address.`);
      return;
    }
    if (senders.includes(a)) {
      setErr("That address is already in the list.");
      return;
    }
    setDraft("");
    persist([...senders, a]);
  }

  function remove(a: string) {
    persist(senders.filter((s) => s !== a));
  }

  return (
    <div className="mt-4 rounded-xl border border-hair bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink">Approved sender addresses</h3>
          <p className="text-xs text-muted">
            Configure the &ldquo;From&rdquo; addresses your team can send email as. These
            appear in the email composer&rsquo;s From dropdown for everyone in the org.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {!loaded ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : senders.length === 0 ? (
          <p className="text-xs text-muted">
            No addresses configured yet. Each person can already send from their own
            login email — add shared/team addresses here.
          </p>
        ) : (
          senders.map((a) => (
            <div
              key={a}
              className="flex items-center gap-2 rounded-lg border border-hair px-2.5 py-1.5 text-sm"
            >
              <span className="flex-1 truncate text-ink" title={a}>
                ✉ {a}
              </span>
              {smtpFrom && a === smtpFrom.toLowerCase() && (
                <span className="flex-none rounded-full bg-canvas px-2 py-0.5 text-[10px] font-semibold text-muted">
                  SMTP default
                </span>
              )}
              <button
                onClick={() => remove(a)}
                disabled={pending}
                className="flex-none text-muted hover:text-danger disabled:opacity-50"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="team@yourcompany.com"
          className="w-full rounded-lg border border-hair bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal"
        />
        <button
          onClick={add}
          disabled={pending}
          className="flex-none rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-60"
        >
          Add
        </button>
      </div>

      {err && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{err}</p>}
      {msg && <p className="mt-2 rounded-lg bg-grass/10 px-3 py-2 text-xs text-grass">{msg}</p>}

      <p className="mt-3 text-[11px] text-muted">
        Delivery routes through your configured SMTP account. Addresses on the same
        domain send as-is; an address on a different domain may be rewritten by the
        provider unless it&rsquo;s a verified send-as alias.
      </p>
    </div>
  );
}
