import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { permsOf } from "@/lib/guard";
import { getProvider } from "@/lib/integrations/registry";

// GET /api/oauth/[provider]/start — generic OAuth2 kickoff for any provider
// in the registry (github, gitlab, slack, jira, gmail, google_calendar,
// outlook, teams). Same admin-gated, CSRF-state-cookie pattern this app
// already used for DocuSign, generalized so adding a provider needs no new
// route file — only a registry entry.
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await params;
  const origin = new URL(request.url).origin;
  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${origin}/login`, 302);

  const provider = getProvider(providerId);
  if (!provider) return Response.redirect(`${origin}/settings?int_error=unknown_provider`, 302);
  if (provider.authKind !== "oauth2")
    return Response.redirect(`${origin}/settings?int_error=not_oauth&provider=${providerId}`, 302);

  const p = permsOf(user);
  if (!p.canManageUsers && !p.canManageEnvironments)
    return Response.redirect(`${origin}/settings?int_error=admin_only&provider=${providerId}`, 302);
  if (!provider.configured())
    return Response.redirect(`${origin}/settings?int_error=not_configured&provider=${providerId}`, 302);

  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(`oauth_state_${providerId}`, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  const redirectUri = `${origin}/api/oauth/${providerId}/callback`;
  return Response.redirect(provider.buildAuthUrl!(redirectUri, state), 302);
}
