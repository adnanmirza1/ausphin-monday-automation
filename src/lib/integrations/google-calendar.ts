import "server-only";
import type { ProviderConfig } from "./types";

// Same Google OAuth app as Gmail/Sign-In (see gmail.ts), independent scope +
// independent ConnectedIntegration row.
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CAL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"].join(" ");

export const googleCalendar: ProviderConfig = {
  id: "google_calendar",
  name: "Google Calendar",
  authKind: "oauth2",
  requiredEnvVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  docsHint: "Uses the same Google OAuth app as Google Sign-In — add calendar.events under OAuth consent screen scopes",

  configured() {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },

  buildAuthUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: CAL_SCOPES,
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
    if (!res.ok) throw new Error(`Google Calendar token exchange failed: ${res.status} ${await res.text()}`);
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
    if (!res.ok) throw new Error(`Google Calendar token refresh failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; expires_in?: number };
    return { accessToken: j.access_token, expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null };
  },

  async getAccountInfo(accessToken) {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`);
    const j = (await res.json()) as { email?: string };
    if (!j.email) throw new Error("Google account did not return an email address.");
    return { label: j.email.toLowerCase() };
  },

  triggers: [],

  actions: [
    {
      id: "create_event",
      label: "Create a calendar event",
      fields: [
        { key: "summary", label: "Title", kind: "text", placeholder: "e.g. Interview: {{Item}}" },
        { key: "startIso", label: "Start (ISO datetime)", kind: "text", placeholder: "2026-08-20T10:00:00Z" },
        { key: "endIso", label: "End (ISO datetime)", kind: "text", placeholder: "2026-08-20T10:30:00Z" },
        { key: "description", label: "Description", kind: "textarea", placeholder: "Optional" },
      ],
    },
  ],

  async executeAction(accessToken, actionId, _resource, fields) {
    if (actionId !== "create_event") return { ok: false, error: `unknown action "${actionId}"` };
    if (!fields.startIso || !fields.endIso) return { ok: false, error: "start/end datetime required" };
    try {
      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: fields.summary || "(untitled event)",
          description: fields.description || undefined,
          start: { dateTime: fields.startIso },
          end: { dateTime: fields.endIso },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `Google Calendar API ${res.status}: ${text.slice(0, 300)}` };
      }
      const j = (await res.json()) as { htmlLink: string };
      return { ok: true, url: j.htmlLink };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
