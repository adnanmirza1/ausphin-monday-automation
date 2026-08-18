import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/integrations/registry";

// GET /api/oauth/[provider]/callback — generic OAuth2 callback for any
// registry provider. Exchanges the code, fetches account info, upserts one
// ConnectedIntegration row per (org, provider) — the shared storage every
// provider reuses instead of a one-off table each.
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await params;
  const url = new URL(request.url);
  const origin = url.origin;
  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${origin}/login`, 302);

  const provider = getProvider(providerId);
  if (!provider || provider.authKind !== "oauth2")
    return Response.redirect(`${origin}/settings?int_error=unknown_provider`, 302);
  if (!provider.configured())
    return Response.redirect(`${origin}/settings?int_error=not_configured&provider=${providerId}`, 302);

  const error = url.searchParams.get("error");
  if (error) return Response.redirect(`${origin}/settings?int_error=${encodeURIComponent(error)}&provider=${providerId}`, 302);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expected = store.get(`oauth_state_${providerId}`)?.value;
  store.delete(`oauth_state_${providerId}`);
  if (!code || !state || !expected || state !== expected)
    return Response.redirect(`${origin}/settings?int_error=invalid_state&provider=${providerId}`, 302);

  try {
    const redirectUri = `${origin}/api/oauth/${providerId}/callback`;
    const tokens = await provider.exchangeCode!(code, redirectUri);
    const info = await provider.getAccountInfo!(tokens.accessToken);

    await db.connectedIntegration.upsert({
      where: { orgId_provider: { orgId: user.orgId, provider: providerId } },
      create: {
        orgId: user.orgId,
        userId: user.id,
        provider: providerId,
        accountLabel: info.label,
        accountMeta: JSON.stringify(info.meta ?? {}),
        scope: tokens.scope ?? "",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? "",
        expiresAt: tokens.expiresAt ?? null,
      },
      update: {
        userId: user.id,
        accountLabel: info.label,
        accountMeta: JSON.stringify(info.meta ?? {}),
        scope: tokens.scope ?? "",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || undefined,
        expiresAt: tokens.expiresAt ?? null,
      },
    });
    return Response.redirect(`${origin}/settings?int_connected=${encodeURIComponent(info.label)}&provider=${providerId}`, 302);
  } catch (e) {
    console.error(`[integrations:${providerId}:callback]`, e);
    return Response.redirect(`${origin}/settings?int_error=exchange_failed&provider=${providerId}`, 302);
  }
}
