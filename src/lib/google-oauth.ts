import "server-only";

// Google OAuth for connecting extra "From" email accounts (Requirement #1).
// Uses the plain OAuth 2.0 web-server flow via fetch — no googleapis dependency.
// Activates once GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are configured.

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

// Scopes: identify the account (email) + permission to send mail as it.
// gmail.send is a Google "restricted" scope — for external users the OAuth app
// must pass Google's verification; internal Workspace apps work without it.
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

export function googleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline", // request a refresh token
    prompt: "consent", // force refresh-token issuance every time
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
};

// Exchange an authorization code for tokens.
export async function exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens> {
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
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? "",
    expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null,
  };
}

// Get a fresh access token from a stored refresh token.
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date | null }> {
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
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  return {
    accessToken: j.access_token,
    expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null,
  };
}

// Resolve the authorized account's email address.
export async function getUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Userinfo failed: ${res.status}`);
  const j = (await res.json()) as { email?: string };
  if (!j.email) throw new Error("Google account did not return an email address.");
  return j.email.toLowerCase();
}
