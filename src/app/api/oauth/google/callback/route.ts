import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { googleOAuthConfigured, exchangeCode, getUserEmail } from "@/lib/google-oauth";

// A tiny HTML response that tells the opener (composer popup) it's done and
// closes itself; if opened in the same tab, it bounces back to Settings.
function resultPage(origin: string, ok: boolean, detail: string): Response {
  const payload = JSON.stringify({ source: "google-email-connect", ok, detail });
  const settingsUrl = ok
    ? `${origin}/settings?email_connected=${encodeURIComponent(detail)}`
    : `${origin}/settings?email_error=${encodeURIComponent(detail)}`;
  const html = `<!doctype html><meta charset="utf-8"><title>Connecting…</title>
<body style="font:14px system-ui;padding:24px;color:#1f2937">
<p>${ok ? "✓ Email account connected. You can close this window." : "Could not connect the account."}</p>
<script>
  try { if (window.opener) { window.opener.postMessage(${payload}, "${origin}"); } } catch (e) {}
  if (window.opener) { setTimeout(function(){ window.close(); }, 600); }
  else { location.replace(${JSON.stringify(settingsUrl)}); }
</script>
</body>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// GET /api/oauth/google/callback — Google redirects here with ?code&state.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${origin}/login`, 302);
  if (!googleOAuthConfigured()) return resultPage(origin, false, "google_not_configured");

  const error = url.searchParams.get("error");
  if (error) return resultPage(origin, false, error);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expected = store.get("google_oauth_state")?.value;
  store.delete("google_oauth_state");
  if (!code || !state || !expected || state !== expected) {
    return resultPage(origin, false, "invalid_state");
  }

  try {
    const redirectUri = `${origin}/api/oauth/google/callback`;
    const tokens = await exchangeCode(code, redirectUri);
    const email = await getUserEmail(tokens.accessToken);

    const existing = await db.connectedEmailAccount.findUnique({
      where: { orgId_email: { orgId: user.orgId, email } },
    });
    await db.connectedEmailAccount.upsert({
      where: { orgId_email: { orgId: user.orgId, email } },
      create: {
        orgId: user.orgId,
        userId: user.id,
        email,
        provider: "google",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
      update: {
        userId: user.id,
        accessToken: tokens.accessToken,
        // Google only returns a refresh token on the first consent; keep the
        // stored one if this grant didn't include a fresh one.
        refreshToken: tokens.refreshToken || existing?.refreshToken || "",
        expiresAt: tokens.expiresAt,
      },
    });
    return resultPage(origin, true, email);
  } catch (e) {
    console.error("[google-oauth:callback]", e);
    return resultPage(origin, false, "exchange_failed");
  }
}
