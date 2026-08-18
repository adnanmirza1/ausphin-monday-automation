import "server-only";
import type { ProviderConfig } from "./types";

// Reuses GOOGLE_CLIENT_ID/SECRET (same OAuth app as Google Sign-In / the
// send-as-email feature — no separate app registration needed) but requests
// its own scope and is stored as an independent ConnectedIntegration row, so
// this feature can't regress the existing sign-in / ConnectedEmailAccount
// flows and vice versa.
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"].join(" ");

export const gmail: ProviderConfig = {
  id: "gmail",
  name: "Gmail",
  authKind: "oauth2",
  requiredEnvVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  docsHint: "Uses the same Google OAuth app as Google Sign-In — add gmail.send under OAuth consent screen scopes",

  configured() {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },

  buildAuthUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw new Error(`Gmail token exchange failed: ${res.status} ${await res.text()}`);
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
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; expires_in?: number };
    return { accessToken: j.access_token, expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null };
  },

  async getAccountInfo(accessToken) {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Gmail userinfo failed: ${res.status}`);
    const j = (await res.json()) as { email?: string };
    if (!j.email) throw new Error("Google account did not return an email address.");
    return { label: j.email.toLowerCase() };
  },

  triggers: [],

  actions: [
    {
      id: "send_email",
      label: "Send an email via Gmail",
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
      const raw = buildRawMessage(to, fields.subject || "(no subject)", fields.body || "");
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `Gmail API ${res.status}: ${text.slice(0, 300)}` };
      }
      const j = (await res.json()) as { id: string };
      return { ok: true, url: `https://mail.google.com/mail/u/0/#sent/${j.id}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

function buildRawMessage(to: string, subject: string, body: string): string {
  const msg = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body].join("\r\n");
  return Buffer.from(msg).toString("base64url");
}
