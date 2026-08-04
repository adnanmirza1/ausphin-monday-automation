import { db } from "@/lib/db";
import { syncEnvelope } from "@/lib/docusign-sync";

// Poll non-terminal DocuSign envelopes and sync their status to the board
// (writes the status column + uploads the signed PDF on completion). Point a
// scheduler at GET /api/cron/docusign with header: Authorization: Bearer <CRON_SECRET>.
// This gives ongoing status tracking even without a DocuSign Connect webhook.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`)
    return new Response("Unauthorized", { status: 401 });

  const pending = await db.docuSignEnvelope.findMany({
    where: { envelopeId: { not: "" }, status: { notIn: ["signed", "declined", "voided", "completed", "expired"] } },
    select: { id: true },
    take: 500,
  });
  let synced = 0;
  for (const e of pending) {
    try {
      await syncEnvelope(e.id);
      synced++;
    } catch (err) {
      console.error("[cron:docusign]", err);
    }
  }
  return Response.json({ ok: true, checked: pending.length, synced });
}
