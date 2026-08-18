import "server-only";
import type { ProviderConfig } from "./types";

const SLACK_SCOPES = "channels:read,chat:write,groups:read";

export const slack: ProviderConfig = {
  id: "slack",
  name: "Slack",
  authKind: "oauth2",
  requiredEnvVars: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
  docsHint: "Create an app at api.slack.com/apps and add the OAuth scopes: " + SLACK_SCOPES,

  configured() {
    return !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);
  },

  buildAuthUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      scope: SLACK_SCOPES,
      state,
    });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID ?? "",
        client_secret: process.env.SLACK_CLIENT_SECRET ?? "",
        code,
        redirect_uri: redirectUri,
      }),
    });
    const j = (await res.json()) as { ok: boolean; access_token?: string; error?: string; team?: { name: string } };
    if (!j.ok || !j.access_token) throw new Error(j.error || "Slack token exchange failed");
    return { accessToken: j.access_token, scope: SLACK_SCOPES };
  },

  async getAccountInfo(accessToken) {
    const res = await fetch("https://slack.com/api/team.info", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const j = (await res.json()) as { ok: boolean; team?: { name: string; id: string }; error?: string };
    if (!j.ok || !j.team) throw new Error(j.error || "Slack team lookup failed");
    return { label: j.team.name, meta: { teamId: j.team.id } };
  },

  async listResources(accessToken) {
    const res = await fetch("https://slack.com/api/conversations.list?limit=200&exclude_archived=true", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const j = (await res.json()) as { ok: boolean; channels?: { id: string; name: string }[] };
    if (!j.ok || !j.channels) return [];
    return j.channels.map((c) => ({ id: c.id, label: `#${c.name}` }));
  },

  triggers: [],

  actions: [
    {
      id: "post_message",
      label: "Post a message to a channel",
      needsResource: true,
      resourceLabel: "Channel",
      fields: [{ key: "message", label: "Message", kind: "textarea", placeholder: "e.g. New item: {{Item}}" }],
    },
  ],

  async executeAction(accessToken, actionId, resource, fields) {
    if (actionId !== "post_message") return { ok: false, error: `unknown action "${actionId}"` };
    if (!resource) return { ok: false, error: "no channel selected" };
    try {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel: resource, text: fields.message || "(empty message)" }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string; ts?: string };
      if (!j.ok) return { ok: false, error: j.error || "Slack API error" };
      return { ok: true, url: `https://slack.com/archives/${resource}/p${(j.ts ?? "").replace(".", "")}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
