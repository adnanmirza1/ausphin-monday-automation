import { syncByEnvelopeId } from "@/lib/docusign-sync";

// DocuSign Connect webhook. Configure a Connect listener in DocuSign Admin →
// Connect, pointing at POST /api/docusign/webhook, sending envelope events.
// We accept the notification and re-sync the envelope from the API (so our
// board status + signed-file upload stay correct regardless of payload shape).
export async function POST(request: Request) {
  let envelopeId = "";
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = (await request.json()) as {
        data?: { envelopeId?: string };
        envelopeId?: string;
        envelopeStatus?: { envelopeId?: string };
      };
      envelopeId = body.data?.envelopeId || body.envelopeId || body.envelopeStatus?.envelopeId || "";
    } else {
      // Legacy XML Connect payload — extract the EnvelopeId tag.
      const xml = await request.text();
      envelopeId = /<EnvelopeId>([^<]+)<\/EnvelopeId>/i.exec(xml)?.[1] ?? "";
    }
  } catch {
    return new Response("bad payload", { status: 400 });
  }
  if (envelopeId) {
    try {
      await syncByEnvelopeId(envelopeId);
    } catch (e) {
      console.error("[docusign:webhook]", e);
    }
  }
  return Response.json({ ok: true });
}
