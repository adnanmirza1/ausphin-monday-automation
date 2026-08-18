import "server-only";
import type { ProviderConfig } from "./types";

const GITHUB_SCOPES = "repo"; // create issues in repos the user can access

export const github: ProviderConfig = {
  id: "github",
  name: "GitHub",
  authKind: "oauth2",
  requiredEnvVars: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  docsHint: "Register an OAuth App at github.com/settings/developers",

  configured() {
    return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  },

  buildAuthUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      scope: GITHUB_SCOPES,
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID ?? "",
        client_secret: process.env.GITHUB_CLIENT_SECRET ?? "",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token?: string; scope?: string; error?: string; error_description?: string };
    if (!j.access_token) throw new Error(j.error_description || j.error || "no access_token returned");
    return { accessToken: j.access_token, scope: j.scope ?? "" };
  },

  async getAccountInfo(accessToken) {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GitHub user lookup failed: ${res.status}`);
    const j = (await res.json()) as { login: string; name: string | null; avatar_url: string };
    return { label: j.login, meta: { name: j.name ?? j.login, avatarUrl: j.avatar_url } };
  },

  async listResources(accessToken) {
    const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { full_name: string }[];
    return j.map((r) => ({ id: r.full_name, label: r.full_name }));
  },

  triggers: [
    { id: "issue_created", label: "When an issue is created", needsResource: true, resourceLabel: "Repository" },
  ],

  actions: [
    {
      id: "create_issue",
      label: "Create an issue",
      needsResource: true,
      resourceLabel: "Repository",
      fields: [
        { key: "title", label: "Title", kind: "text", placeholder: "e.g. New candidate: {{Item}}" },
        { key: "body", label: "Body", kind: "textarea", placeholder: "Issue body (optional)" },
      ],
    },
  ],

  async executeAction(accessToken, actionId, resource, fields) {
    if (actionId !== "create_issue") return { ok: false, error: `unknown action "${actionId}"` };
    if (!resource || !resource.includes("/")) return { ok: false, error: `invalid repo "${resource}" (expected owner/name)` };
    try {
      const res = await fetch(`https://api.github.com/repos/${resource}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: fields.title || "(untitled)", body: fields.body || undefined }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `GitHub API ${res.status}: ${text.slice(0, 300)}` };
      }
      const j = (await res.json()) as { html_url: string };
      return { ok: true, url: j.html_url };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
