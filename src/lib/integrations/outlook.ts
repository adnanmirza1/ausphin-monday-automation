import "server-only";
import type { ProviderConfig } from "./types";

// Microsoft identity platform v2.0 — shared app registration with Teams
// (outlook.ts / teams.ts both use MICROSOFT_CLIENT_ID/SECRET, same pattern
// as Gmail/Google Calendar sharing one Google app), independent scope and
// independent ConnectedIntegration row per provider.
function tenant(): string {
  return process.env.MICROSOFT_TENANT_ID || "common";
}
function authEndpoint(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`;
}
function tokenEndpoint(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`;
}
const OUTLOOK_SCOPES = "offline_access openid email Mail.Send";

export const outlook: ProviderConfig = {
  id: "outlook",
  name: "Microsoft Outlook",
  authKind: "oauth2",
  requiredEnvVars: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
  docsHint: "Register an app at entra.microsoft.com (App registrations) with Mail.Send delegated permission",

  configured() {
    return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  },

  buildAuthUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: OUTLOOK_SCOPES,
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
        scope: OUTLOOK_SCOPES,
      }),
    });
    if (!res.ok) throw new Error(`Outlook token exchange failed: ${res.status} ${await res.text()}`);
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
        scope: OUTLOOK_SCOPES,
      }),
    });
    if (!res.ok) throw new Error(`Outlook token refresh failed: ${res.status} ${await res.text()}`);
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
    if (!res.ok) throw new Error(`Outlook profile lookup failed: ${res.status}`);
    const j = (await res.json()) as { mail?: string; userPrincipalName: string; displayName?: string };
    return { label: j.mail || j.userPrincipalName, meta: { name: j.displayName } };
  },

  triggers: [],

  actions: [
    {
      id: "send_email",
      label: "Send an email via Outlook",
      fields: [
        { key: "to", label: "To", kind: "text", placeholder: "recipient@example.com or {{Email}}" },
        { key: "subject", label: "Subject", kind: "text", placeholder: "e.g. Update on {{Item}}" },
        { key: "body", label: "Body", kind: "textarea", placeholder: "Message body" },
      ],
    },
  ],

  async executeAction(accessToken, actionId, _resource, fields) {
    if (actionId !== "send_email") return { ok: false, error: `unknown action "${actionId}"` };
    const to = (fields.to || "").trim();
    if (!to) return { ok: false, error: "no recipient" };
    try {
      const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: fields.subject || "(no subject)",
            body: { contentType: "Text", content: fields.body || "" },
            toRecipients: [{ emailAddress: { address: to } }],
          },
        }),
      });
      if (res.status !== 202) {
        const text = await res.text();
        return { ok: false, error: `Outlook API ${res.status}: ${text.slice(0, 300)}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
