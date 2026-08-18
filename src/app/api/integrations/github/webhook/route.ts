import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { runIntegrationAutomations } from "@/lib/automation";

// POST /api/integrations/github/webhook — GitHub calls this on repo events.
// Verified with GITHUB_WEBHOOK_SECRET (HMAC SHA-256 over the raw body, per
// GitHub's signing spec) rather than trusting payload contents, same
// principle as the DocuSign webhook re-syncing from the real API instead of
// trusting the POST body blindly. This is the provider-specific half of the
// generic integration_trigger pipeline in src/lib/automation.ts — each
// provider that offers a real webhook trigger (only GitHub, for now) gets
// its own thin receiver like this one that verifies the payload and calls
// runIntegrationAutomations(orgId, provider, triggerId, resource, ...).
function verifySignature(secret: string, rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const event = request.headers.get("x-github-event");
  const signature = request.headers.get("x-hub-signature-256");
  const delivery = request.headers.get("x-github-delivery") ?? "";

  let payload: { repository?: { full_name?: string }; action?: string; issue?: { title?: string; html_url?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const repo = payload.repository?.full_name;
  if (!repo) return new Response("no repository in payload", { status: 400 });

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret && !verifySignature(secret, rawBody, signature)) {
    return new Response("invalid signature", { status: 401 });
  }

  if (event !== "issues" || payload.action !== "opened" || !payload.issue) {
    return new Response("ignored", { status: 200 });
  }

  // Cheap MVP lookup: every org with a GitHub connection gets a chance to
  // match — runIntegrationAutomations no-ops for orgs whose automations
  // don't reference this repo. Acceptable at current scale; a repo->org
  // index is the natural upgrade once several orgs connect GitHub.
  const connections = await db.connectedIntegration.findMany({ where: { provider: "github" } });
  for (const conn of connections) {
    await runIntegrationAutomations(
      conn.orgId,
      "github",
      "issue_created",
      repo,
      payload.issue.title ?? "",
      payload.issue.html_url ?? ""
    ).catch((e) => console.error("[github:webhook]", delivery, e));
  }

  return new Response("ok", { status: 200 });
}
