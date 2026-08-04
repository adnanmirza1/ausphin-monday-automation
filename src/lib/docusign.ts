import "server-only";
import { db } from "@/lib/db";
import { refreshAccessToken, docusignOAuthConfigured } from "@/lib/docusign-oauth";

// DocuSign eSignature REST API (v2.1). The org connects an account via OAuth
// (see /api/oauth/docusign). Signature placeholders in the generated document —
// {{Signature_N}}, {{Signer_Name_N}}, {{Signed_Date_N}}, {{Initial_N}} — are
// converted to DocuSign anchor tabs automatically (no manual field placement).

export function docusignConfigured(): boolean {
  return docusignOAuthConfigured();
}

export type DsAccount = { id: string; accountId: string; baseUri: string; accessToken: string };

// Get the org's connected account with a valid (refreshed) access token.
export async function getDsAccount(orgId: string): Promise<DsAccount | null> {
  const acct = await db.connectedDocuSignAccount.findUnique({ where: { orgId } });
  if (!acct) return null;
  let token = acct.accessToken;
  const expired = !acct.expiresAt || acct.expiresAt.getTime() < Date.now() + 60_000;
  if ((!token || expired) && acct.refreshToken) {
    try {
      const r = await refreshAccessToken(acct.refreshToken);
      token = r.accessToken;
      await db.connectedDocuSignAccount.update({
        where: { id: acct.id },
        data: { accessToken: r.accessToken, refreshToken: r.refreshToken, expiresAt: r.expiresAt },
      });
    } catch (e) {
      console.error("[docusign:refresh]", e);
    }
  }
  if (!token) return null;
  return { id: acct.id, accountId: acct.accountId, baseUri: acct.baseUri, accessToken: token };
}

function api(a: DsAccount, path: string): string {
  return `${a.baseUri}/restapi/v2.1/accounts/${a.accountId}${path}`;
}
function authHeaders(a: DsAccount, json = true): Record<string, string> {
  return { Authorization: `Bearer ${a.accessToken}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}

// Normalize DocuSign envelope/recipient status → our board vocabulary.
export function mapStatus(s: string): string {
  const m = s.toLowerCase();
  if (m === "completed") return "signed";
  if (m === "created") return "draft";
  return m; // sent | delivered | declined | voided | (viewed via recipient events)
}

// Anchor tabs for recipient N, matching the signature placeholders in the doc.
// DocuSign ignores any anchorString it doesn't find, so it's safe to include all.
function tabsFor(n: number) {
  const anchor = (s: string) => ({ anchorString: s, anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "-6" });
  return {
    signHereTabs: [anchor(`{{Signature_${n}}}`)],
    initialHereTabs: [anchor(`{{Initial_${n}}}`)],
    dateSignedTabs: [anchor(`{{Signed_Date_${n}}}`), anchor(`{{Date_Signed_${n}}}`)],
    fullNameTabs: [anchor(`{{Signer_Name_${n}}}`)],
  };
}

export type Recipient = { email: string; name: string; routingOrder?: number };
export type SendResult = { ok: boolean; envelopeId?: string; error?: string };

// Create + send an envelope from a document (with auto anchor tabs).
export async function sendEnvelopeFromDocument(
  orgId: string,
  input: {
    documentBase64: string;
    documentName: string;
    fileExtension: string; // "docx" | "pdf"
    recipients: Recipient[];
    subject: string;
    message?: string;
  }
): Promise<SendResult> {
  const a = await getDsAccount(orgId);
  if (!a) return { ok: false, error: "DocuSign is not connected." };
  const signers = input.recipients
    .filter((r) => r.email)
    .map((r, i) => ({
      email: r.email,
      name: r.name || r.email,
      recipientId: String(i + 1),
      routingOrder: String(r.routingOrder ?? i + 1),
      ...tabsFor(i + 1),
    }));
  if (signers.length === 0) return { ok: false, error: "No recipient email." };

  const body = {
    emailSubject: input.subject || input.documentName,
    emailBlurb: input.message || "",
    status: "sent",
    documents: [
      {
        documentBase64: input.documentBase64,
        name: input.documentName,
        fileExtension: input.fileExtension,
        documentId: "1",
      },
    ],
    recipients: { signers },
  };
  const res = await fetch(api(a, "/envelopes"), { method: "POST", headers: authHeaders(a), body: JSON.stringify(body) });
  if (!res.ok) return { ok: false, error: `DocuSign send failed: ${res.status} ${await res.text()}` };
  const j = (await res.json()) as { envelopeId?: string };
  return j.envelopeId ? { ok: true, envelopeId: j.envelopeId } : { ok: false, error: "No envelopeId returned." };
}

// Create + send an envelope from a DocuSign server template (roles filled).
export async function sendEnvelopeFromTemplate(
  orgId: string,
  input: { templateId: string; recipients: Recipient[]; subject?: string; message?: string }
): Promise<SendResult> {
  const a = await getDsAccount(orgId);
  if (!a) return { ok: false, error: "DocuSign is not connected." };
  // Fetch the template's first signer role name to bind the recipient to it.
  let roleName = "Signer";
  try {
    const tr = await fetch(api(a, `/templates/${input.templateId}/recipients`), { headers: authHeaders(a) });
    if (tr.ok) {
      const tj = (await tr.json()) as { signers?: { roleName?: string }[] };
      roleName = tj.signers?.[0]?.roleName || roleName;
    }
  } catch {
    /* fall back to default role */
  }
  const templateRoles = input.recipients
    .filter((r) => r.email)
    .map((r) => ({ email: r.email, name: r.name || r.email, roleName }));
  if (templateRoles.length === 0) return { ok: false, error: "No recipient email." };

  const body = {
    templateId: input.templateId,
    templateRoles,
    status: "sent",
    ...(input.subject ? { emailSubject: input.subject } : {}),
    ...(input.message ? { emailBlurb: input.message } : {}),
  };
  const res = await fetch(api(a, "/envelopes"), { method: "POST", headers: authHeaders(a), body: JSON.stringify(body) });
  if (!res.ok) return { ok: false, error: `DocuSign template send failed: ${res.status} ${await res.text()}` };
  const j = (await res.json()) as { envelopeId?: string };
  return j.envelopeId ? { ok: true, envelopeId: j.envelopeId } : { ok: false, error: "No envelopeId returned." };
}

export type DsTemplate = { templateId: string; name: string };
export async function listTemplates(orgId: string): Promise<DsTemplate[]> {
  const a = await getDsAccount(orgId);
  if (!a) return [];
  const res = await fetch(api(a, "/templates?count=500"), { headers: authHeaders(a) });
  if (!res.ok) return [];
  const j = (await res.json()) as { envelopeTemplates?: { templateId: string; name: string }[] };
  return (j.envelopeTemplates ?? []).map((t) => ({ templateId: t.templateId, name: t.name }));
}

export async function getEnvelopeStatus(orgId: string, envelopeId: string): Promise<string | null> {
  const a = await getDsAccount(orgId);
  if (!a) return null;
  const res = await fetch(api(a, `/envelopes/${envelopeId}`), { headers: authHeaders(a) });
  if (!res.ok) return null;
  const j = (await res.json()) as { status?: string };
  return j.status ? mapStatus(j.status) : null;
}

// Download the completed (signed) document set as a single PDF.
export async function downloadSignedPdf(orgId: string, envelopeId: string): Promise<Buffer | null> {
  const a = await getDsAccount(orgId);
  if (!a) return null;
  const res = await fetch(api(a, `/envelopes/${envelopeId}/documents/combined`), { headers: authHeaders(a, false) });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
