import "server-only";
import type { ProviderConfig } from "./types";

const GITLAB_SCOPES = "api";

function baseUrl(): string {
  return process.env.GITLAB_BASE_URL || "https://gitlab.com";
}

export const gitlab: ProviderConfig = {
  id: "gitlab",
  name: "GitLab",
  authKind: "oauth2",
  requiredEnvVars: ["GITLAB_APP_ID", "GITLAB_APP_SECRET"],
  docsHint: "Register an application at gitlab.com/-/profile/applications (or your self-hosted instance)",

  configured() {
    return !!(process.env.GITLAB_APP_ID && process.env.GITLAB_APP_SECRET);
  },

  buildAuthUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: process.env.GITLAB_APP_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GITLAB_SCOPES,
      state,
    });
    return `${baseUrl()}/oauth/authorize?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch(`${baseUrl()}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GITLAB_APP_ID ?? "",
        client_secret: process.env.GITLAB_APP_SECRET ?? "",
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) throw new Error(`GitLab token exchange failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? "",
      expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null,
    };
  },

  async refreshToken(refreshToken) {
    const res = await fetch(`${baseUrl()}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GITLAB_APP_ID ?? "",
        client_secret: process.env.GITLAB_APP_SECRET ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new Error(`GitLab token refresh failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? "",
      expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null,
    };
  },

  async getAccountInfo(accessToken) {
    const res = await fetch(`${baseUrl()}/api/v4/user`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`GitLab user lookup failed: ${res.status}`);
    const j = (await res.json()) as { username: string; name: string };
    return { label: j.username, meta: { name: j.name } };
  },

  async listResources(accessToken) {
    const res = await fetch(`${baseUrl()}/api/v4/projects?membership=true&per_page=100&order_by=last_activity_at`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { id: number; path_with_namespace: string }[];
    return j.map((p) => ({ id: String(p.id), label: p.path_with_namespace }));
  },

  triggers: [
    { id: "issue_created", label: "When an issue is created", needsResource: true, resourceLabel: "Project" },
  ],

  actions: [
    {
      id: "create_issue",
      label: "Create an issue",
      needsResource: true,
      resourceLabel: "Project",
      fields: [
        { key: "title", label: "Title", kind: "text", placeholder: "e.g. New candidate: {{Item}}" },
        { key: "body", label: "Description", kind: "textarea", placeholder: "Issue description (optional)" },
      ],
    },
  ],

  async executeAction(accessToken, actionId, resource, fields) {
    if (actionId !== "create_issue") return { ok: false, error: `unknown action "${actionId}"` };
    if (!resource) return { ok: false, error: "no project selected" };
    try {
      const res = await fetch(
        `${baseUrl()}/api/v4/projects/${encodeURIComponent(resource)}/issues`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ title: fields.title || "(untitled)", description: fields.body || undefined }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `GitLab API ${res.status}: ${text.slice(0, 300)}` };
      }
      const j = (await res.json()) as { web_url: string };
      return { ok: true, url: j.web_url };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
