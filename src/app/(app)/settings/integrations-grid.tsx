"use client";

import { useEffect, useState, useTransition } from "react";
import {
  listIntegrationStatuses,
  disconnectIntegration,
  connectWithApiKey,
  type IntegrationStatus,
} from "@/app/actions/integrations";

// Generic Connect/Manage/Reconnect/Disconnect card grid, one card per
// registry provider (github, gitlab, slack, jira, gmail, google_calendar,
// outlook, teams, circleci, pagerduty). This is the "reusable integration
// architecture" the automation feature is built on: adding a provider means
// adding one file to src/lib/integrations/ and one entry to registry.ts —
// this component and every route/action it calls stay untouched.
function readQueryFeedback(): { msg: string | null; err: string | null; provider: string | null } {
  if (typeof window === "undefined") return { msg: null, err: null, provider: null };
  const p = new URLSearchParams(window.location.search);
  const connected = p.get("int_connected");
  const e = p.get("int_error");
  const provider = p.get("provider");
  const msg = connected ? `✓ Connected as ${connected}.` : null;
  const err = e
    ? e === "not_configured" ? "Not configured yet — see the setup hint below."
    : e === "admin_only" ? "Only an admin can connect this integration."
    : e === "not_oauth" ? "This integration connects with an API key, not OAuth."
    : e === "unknown_provider" ? "Unknown integration."
    : `Could not connect (${e}).`
    : null;
  if (connected || e) window.history.replaceState({}, "", "/settings");
  return { msg, err, provider };
}

export function IntegrationsGrid() {
  const [statuses, setStatuses] = useState<IntegrationStatus[] | null>(null);
  const [feedback] = useState(readQueryFeedback);

  const refresh = () => listIntegrationStatuses().then(setStatuses).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  if (statuses === null) return <p className="text-sm text-muted">Loading integrations…</p>;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {statuses.map((s) => (
        <IntegrationCard
          key={s.provider}
          status={s}
          feedback={feedback.provider === s.provider ? feedback : { msg: null, err: null, provider: null }}
          onChange={refresh}
        />
      ))}
    </div>
  );
}

function IntegrationCard({
  status,
  feedback,
  onChange,
}: {
  status: IntegrationStatus;
  feedback: { msg: string | null; err: string | null };
  onChange: () => void;
}) {
  const [pending, start] = useTransition();
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyErr, setKeyErr] = useState<string | null>(null);

  function disconnect() {
    start(async () => {
      await disconnectIntegration(status.provider);
      onChange();
    });
  }

  function submitApiKey() {
    setKeyErr(null);
    start(async () => {
      const res = await connectWithApiKey(status.provider, apiKey);
      if (!res.ok) {
        setKeyErr(res.error ?? "Could not connect.");
        return;
      }
      setApiKeyOpen(false);
      setApiKey("");
      onChange();
    });
  }

  return (
    <div className="rounded-xl border border-hair bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink">{status.name}</h3>
          <p className="text-xs text-muted">{status.authKind === "oauth2" ? "OAuth connection" : "API key connection"}</p>
        </div>
        {status.connected ? (
          <button onClick={disconnect} disabled={pending} className="flex-none rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas disabled:opacity-60">
            Disconnect
          </button>
        ) : status.authKind === "oauth2" ? (
          <a
            href={`/api/oauth/${status.provider}/start`}
            className={`flex-none rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${status.configured ? "bg-teal hover:bg-teal-deep" : "pointer-events-none bg-muted/50"}`}
          >
            + Connect
          </a>
        ) : (
          <button
            onClick={() => setApiKeyOpen((v) => !v)}
            className="flex-none rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep"
          >
            + Connect
          </button>
        )}
      </div>

      {status.authKind === "oauth2" && !status.configured && (
        <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
          Not configured yet. {status.docsHint}. Add{" "}
          {status.requiredEnvVars.map((v, i) => (
            <span key={v}>
              <code className="font-mono">{v}</code>
              {i < status.requiredEnvVars.length - 1 ? ", " : ""}
            </span>
          ))}
          .
        </p>
      )}

      {status.authKind === "api_key" && apiKeyOpen && !status.connected && (
        <div className="mt-3 grid gap-2">
          <p className="text-xs text-muted">{status.docsHint}</p>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste API key / token"
            type="password"
            className="rounded-lg border border-hair bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal"
          />
          <div className="flex gap-2">
            <button
              onClick={submitApiKey}
              disabled={pending || !apiKey.trim()}
              className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
            >
              Verify & connect
            </button>
            <button onClick={() => { setApiKeyOpen(false); setKeyErr(null); }} className="rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-canvas">
              Cancel
            </button>
          </div>
          {keyErr && <p className="text-xs text-danger">{keyErr}</p>}
        </div>
      )}

      {status.connected && (
        <p className="mt-3 rounded-lg bg-grass/10 px-3 py-2 text-xs text-grass">
          🟢 Connected as {status.accountLabel}
        </p>
      )}
      {feedback.err && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{feedback.err}</p>}
      {feedback.msg && <p className="mt-2 rounded-lg bg-grass/10 px-3 py-2 text-xs text-grass">{feedback.msg}</p>}
    </div>
  );
}
