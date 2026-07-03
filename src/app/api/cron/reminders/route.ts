import { runReminders } from "@/lib/reminders";

// Daily cron entry point. Point a scheduler (Vercel Cron, GitHub Actions, etc.)
// at GET /api/cron/reminders with header:  Authorization: Bearer <CRON_SECRET>
// Runs reminders across ALL orgs. If CRON_SECRET is unset, the endpoint is
// disabled (returns 503) to avoid an unauthenticated trigger in production.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "CRON_SECRET not configured." },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const fired = await runReminders();
  return Response.json({ ok: true, fired: fired.length, reminders: fired });
}
