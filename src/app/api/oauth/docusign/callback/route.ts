import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { docusignOAuthConfigured, exchangeCode, getUserInfo } from "@/lib/docusign-oauth";

// GET /api/oauth/docusign/callback — DocuSign redirects here with ?code&state.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${origin}/login`, 302);
  if (!docusignOAuthConfigured()) return Response.redirect(`${origin}/settings?ds_error=not_configured`, 302);

  const error = url.searchParams.get("error");
  if (error) return Response.redirect(`${origin}/settings?ds_error=${encodeURIComponent(error)}`, 302);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expected = store.get("docusign_oauth_state")?.value;
  store.delete("docusign_oauth_state");
  if (!code || !state || !expected || state !== expected)
    return Response.redirect(`${origin}/settings?ds_error=invalid_state`, 302);

  try {
    const redirectUri = `${origin}/api/oauth/docusign/callback`;
    const tokens = await exchangeCode(code, redirectUri);
    const info = await getUserInfo(tokens.accessToken);
    const acct = info.accounts.find((a) => a.isDefault) ?? info.accounts[0];
    if (!acct) return Response.redirect(`${origin}/settings?ds_error=no_account`, 302);

    await db.connectedDocuSignAccount.upsert({
      where: { orgId: user.orgId },
      create: {
        orgId: user.orgId,
        userId: user.id,
        accountId: acct.accountId,
        accountName: acct.accountName,
        baseUri: acct.baseUri,
        email: info.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
      update: {
        userId: user.id,
        accountId: acct.accountId,
        accountName: acct.accountName,
        baseUri: acct.baseUri,
        email: info.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || undefined,
        expiresAt: tokens.expiresAt,
      },
    });
    return Response.redirect(`${origin}/settings?ds_connected=${encodeURIComponent(acct.accountName || info.email)}`, 302);
  } catch (e) {
    console.error("[docusign:callback]", e);
    return Response.redirect(`${origin}/settings?ds_error=exchange_failed`, 302);
  }
}
