import "server-only";
import type { ProviderConfig } from "./types";

// Jira Cloud OAuth 2.0 (3LO) — token exchange goes through Atlassian's auth
// server, then all API calls are made against a cloud instance resolved via
// the accessible-resources endpoint (a Jira OAuth token can span multiple
// sites, so we pick the first accessible cloud id, same simplification the
// GitHub module makes for "first repo the token can see").
const AUTH_ENDPOINT = "https://auth.atlassian.com/authorize";
const TOKEN_ENDPOINT = "https://auth.atlassian.com/oauth/token";
const JIRA_SCOPES = "read:jira-work write:jira-work offline_access";

export const jira: ProviderConfig = {
  id: "jira",
  name: "Jira",
  authKind: "oauth2",
  requiredEnvVars: ["JIRA_CLIENT_ID", "JIRA_CLIENT_SECRET"],
  docsHint: "Create an OAuth 2.0 (3LO) app at developer.atlassian.com/console/myapps",

  configured() {
    return !!(process.env.JIRA_CLIENT_ID && process.env.JIRA_CLIENT_SECRET);
  },

  buildAuthUrl(redirectUri, state) {
    const params = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: process.env.JIRA_CLIENT_ID ?? "",
      scope: JIRA_SCOPES,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      prompt: "consent",
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) throw new Error(`Jira token exchange failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? "",
      expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null,
    };
  },

  async refreshToken(refreshToken) {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) throw new Error(`Jira token refresh failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? "",
      expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null,
    };
  },

  async getAccountInfo(accessToken) {
    const sites = await accessibleSites(accessToken);
    const site = sites[0];
    if (!site) throw new Error("No accessible Jira site for this account");
    return { label: site.name, meta: { cloudId: site.id, url: site.url } };
  },

  async listResources(accessToken) {
    const sites = await accessibleSites(accessToken);
    const site = sites[0];
    if (!site) return [];
    const res = await fetch(`https://api.atlassian.com/ex/jira/${site.id}/rest/api/3/project/search`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { values: { key: string; name: string }[] };
    return j.values.map((p) => ({ id: `${site.id}:${p.key}`, label: `${p.name} (${p.key})` }));
  },

  triggers: [],

  actions: [
    {
      id: "create_issue",
      label: "Create an issue",
      needsResource: true,
      resourceLabel: "Project",
      fields: [{ key: "summary", label: "Summary", kind: "text", placeholder: "e.g. Follow up: {{Item}}" }],
    },
  ],

  async executeAction(accessToken, actionId, resource, fields) {
    if (actionId !== "create_issue") return { ok: false, error: `unknown action "${actionId}"` };
    if (!resource || !resource.includes(":")) return { ok: false, error: "no project selected" };
    const [cloudId, projectKey] = resource.split(":");
    try {
      const res = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            summary: fields.summary || "(untitled)",
            issuetype: { name: "Task" },
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `Jira API ${res.status}: ${text.slice(0, 300)}` };
      }
      const j = (await res.json()) as { key: string };
      const site = (await accessibleSites(accessToken)).find((s) => s.id === cloudId);
      return { ok: true, url: site ? `${site.url}/browse/${j.key}` : j.key };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

async function accessibleSites(accessToken: string): Promise<{ id: string; name: string; url: string }[]> {
  const res = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) return [];
  const j = (await res.json()) as { id: string; name: string; url: string }[];
  return j;
}
