import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { googleOAuthConfigured, buildAuthUrl } from "@/lib/google-oauth";

// GET /api/oauth/google/start — begin connecting an extra "From" email account.
// Sets a CSRF state cookie, then redirects the user to Google's consent screen.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const user = await getCurrentUser();
  if (!user) {
    return Response.redirect(`${origin}/login`, 302);
  }
  if (!googleOAuthConfigured()) {
    return Response.redirect(`${origin}/settings?email_error=google_not_configured`, 302);
  }

  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  const redirectUri = `${origin}/api/oauth/google/callback`;
  return Response.redirect(buildAuthUrl(redirectUri, state), 302);
}
