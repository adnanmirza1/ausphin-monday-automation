import "server-only";
import type { ProviderConfig } from "./types";

// Same Microsoft app registration as outlook.ts (see its comment), a
// different Graph scope (ChannelMessage.Send) and its own connection row.
function tenant(): string {
  return process.env.MICROSOFT_TENANT_ID || "common";
}
function authEndpoint(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`;
}
function tokenEndpoint(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`;
}
const TEAMS_SCOPES = "offline_access openid email Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Send";

export const teams: ProviderConfig = {
  id: "teams",
  name: "Microsoft Teams",
  authKind: "oauth2",
  requiredEnvVars: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
  docsHint: "Register an app at entra.microsoft.com with ChannelMessage.Send delegated permission",

  configured() {
    return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  },

  buildAuthUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: TEAMS_SCOPES,
      state,
    });
    return `${authEndpoint()}?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch(tokenEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: TEAMS_SCOPES,
      }),
    });
    if (!res.ok) throw new Error(`Teams token exchange failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? "",
      expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null,
    };
  },

  async refreshToken(refreshToken) {
    const res = await fetch(tokenEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: TEAMS_SCOPES,
      }),
    });
    if (!res.ok) throw new Error(`Teams token refresh failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? "",
      expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null,
    };
  },

  async getAccountInfo(accessToken) {
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Teams profile lookup failed: ${res.status}`);
    const j = (await res.json()) as { mail?: string; userPrincipalName: string; displayName?: string };
    return { label: j.mail || j.userPrincipalName, meta: { name: j.displayName } };
  },

  async listResources(accessToken) {
    // Resource id encodes "teamId:channelId" — Graph needs both to post.
    const teamsRes = await fetch("https://graph.microsoft.com/v1.0/me/joinedTeams", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!teamsRes.ok) return [];
    const teamsJson = (await teamsRes.json()) as { value: { id: string; displayName: string }[] };
    const out: { id: string; label: string }[] = [];
    for (const t of teamsJson.value) {
      const chRes = await fetch(`https://graph.microsoft.com/v1.0/teams/${t.id}/channels`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!chRes.ok) continue;
      const chJson = (await chRes.json()) as { value: { id: string; displayName: string }[] };
      for (const c of chJson.value) out.push({ id: `${t.id}:${c.id}`, label: `${t.displayName} / ${c.displayName}` });
    }
    return out;
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
    if (!resource || !resource.includes(":")) return { ok: false, error: "no channel selected" };
    const [teamId, channelId] = resource.split(":");
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ body: { content: fields.message || "(empty message)" } }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `Teams API ${res.status}: ${text.slice(0, 300)}` };
      }
      const j = (await res.json()) as { webUrl?: string };
      return { ok: true, url: j.webUrl };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
