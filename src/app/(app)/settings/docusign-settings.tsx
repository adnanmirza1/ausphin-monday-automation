"use client";

import { useEffect, useState, useTransition } from "react";
import { getDocuSignStatus, disconnectDocuSign } from "@/app/actions/docs";

// Connect / disconnect the org's DocuSign account (Additional Feature #4).
export function DocuSignSettings() {
  const [status, setStatus] = useState<{ configured: boolean; connected: boolean; accountName: string; email: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refresh = () => getDocuSignStatus().then(setStatus).catch(() => {});
  useEffect(() => {
    refresh();
    // Surface connect/disconnect results passed back via query params.
    const p = new URLSearchParams(window.location.search);
    if (p.get("ds_connected")) setMsg(`✓ Connected ${p.get("ds_connected")}.`);
    const e = p.get("ds_error");
    if (e) setErr(
      e === "not_configured" ? "DocuSign isn't configured yet — add DOCUSIGN_INTEGRATION_KEY & DOCUSIGN_SECRET."
      : e === "admin_only" ? "Only an admin can connect DocuSign."
      : `Could not connect DocuSign (${e}).`
    );
    if (p.get("ds_connected") || e) window.history.replaceState({}, "", "/settings");
  }, []);

  function disconnect() {
    start(async () => {
      await disconnectDocuSign();
      setMsg("DocuSign disconnected.");
      await refresh();
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-hair bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink">DocuSign e-signature</h3>
          <p className="text-xs text-muted">
            Connect your DocuSign account to send documents for signature, track status, and
            auto-save signed files to the board.
          </p>
        </div>
        {status?.connected ? (
          <button onClick={disconnect} disabled={pending} className="flex-none rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas disabled:opacity-60">
            Disconnect
          </button>
        ) : (
          <a
            href="/api/oauth/docusign/start"
            className={`flex-none rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${status?.configured ? "bg-teal hover:bg-teal-deep" : "pointer-events-none bg-muted/50"}`}
          >
            + Connect DocuSign
          </a>
        )}
      </div>

      {status && !status.configured && (
        <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
          Not configured yet. Add <code className="font-mono">DOCUSIGN_INTEGRATION_KEY</code>,{" "}
          <code className="font-mono">DOCUSIGN_SECRET</code> (and optionally{" "}
          <code className="font-mono">DOCUSIGN_OAUTH_BASE</code> for production) to enable connecting.
        </p>
      )}
      {status?.connected && (
        <p className="mt-3 rounded-lg bg-grass/10 px-3 py-2 text-xs text-grass">
          🟢 Connected{status.accountName ? ` — ${status.accountName}` : ""}{status.email ? ` (${status.email})` : ""}
        </p>
      )}
      {err && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{err}</p>}
      {msg && <p className="mt-2 rounded-lg bg-grass/10 px-3 py-2 text-xs text-grass">{msg}</p>}
    </div>
  );
}
