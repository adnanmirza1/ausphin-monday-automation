import "server-only";

// DocuSign OAuth (Authorization Code Grant) — "connect a DocuSign account".
// Activates once DOCUSIGN_INTEGRATION_KEY + DOCUSIGN_SECRET are set.
//   DOCUSIGN_OAUTH_BASE defaults to the demo server; set to
//   https://account.docusign.com for production.

export function docusignOAuthConfigured(): boolean {
  return !!(process.env.DOCUSIGN_INTEGRATION_KEY && process.env.DOCUSIGN_SECRET);
}

export function oauthBase(): string {
  return process.env.DOCUSIGN_OAUTH_BASE || "https://account-d.docusign.com";
}

export const DOCUSIGN_SCOPES = "signature";

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    scope: DOCUSIGN_SCOPES,
    client_id: process.env.DOCUSIGN_INTEGRATION_KEY ?? "",
    redirect_uri: redirectUri,
    state,
  });
  return `${oauthBase()}/oauth/auth?${params.toString()}`;
}

function basicAuth(): string {
  const id = process.env.DOCUSIGN_INTEGRATION_KEY ?? "";
  const secret = process.env.DOCUSIGN_SECRET ?? "";
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

export type DocuSignTokens = { accessToken: string; refreshToken: string; expiresAt: Date | null };

export async function exchangeCode(code: string, redirectUri: string): Promise<DocuSignTokens> {
  const res = await fetch(`${oauthBase()}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error(`DocuSign token exchange failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? "",
    expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }> {
  const res = await fetch(`${oauthBase()}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`DocuSign token refresh failed: ${res.status}`);
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || refreshToken,
    expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null,
  };
}

export type DsUserInfo = {
  email: string;
  accounts: { accountId: string; accountName: string; baseUri: string; isDefault: boolean }[];
};

export async function getUserInfo(accessToken: string): Promise<DsUserInfo> {
  const res = await fetch(`${oauthBase()}/oauth/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`DocuSign userinfo failed: ${res.status}`);
  const j = (await res.json()) as {
    email?: string;
    accounts?: { account_id: string; account_name: string; base_uri: string; is_default: boolean }[];
  };
  return {
    email: j.email ?? "",
    accounts: (j.accounts ?? []).map((a) => ({
      accountId: a.account_id,
      accountName: a.account_name,
      baseUri: a.base_uri,
      isDefault: a.is_default,
    })),
  };
}
