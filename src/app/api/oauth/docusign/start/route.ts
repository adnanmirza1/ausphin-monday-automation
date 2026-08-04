import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { permsOf } from "@/lib/guard";
import { docusignOAuthConfigured, buildAuthUrl } from "@/lib/docusign-oauth";

// GET /api/oauth/docusign/start — begin connecting the org's DocuSign account.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${origin}/login`, 302);
  const p = permsOf(user);
  if (!p.canManageUsers && !p.canManageEnvironments)
    return Response.redirect(`${origin}/settings?ds_error=admin_only`, 302);
  if (!docusignOAuthConfigured())
    return Response.redirect(`${origin}/settings?ds_error=not_configured`, 302);

  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("docusign_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  const redirectUri = `${origin}/api/oauth/docusign/callback`;
  return Response.redirect(buildAuthUrl(redirectUri, state), 302);
}
