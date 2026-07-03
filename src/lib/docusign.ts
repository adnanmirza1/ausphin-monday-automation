import "server-only";

// External e-signature (DocuSign). Configure via env to enable:
//   DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_ACCOUNT_ID, DOCUSIGN_SECRET, DOCUSIGN_BASE_URL
// Until configured, sendForSignature() is a safe no-op that logs — so the
// "send for signature" flow is exercisable in dev. Swap the stub for the real
// DocuSign eSignature API (create envelope from the document + recipient) once
// credentials are present.

export function docusignConfigured(): boolean {
  return !!(
    process.env.DOCUSIGN_INTEGRATION_KEY &&
    process.env.DOCUSIGN_ACCOUNT_ID &&
    process.env.DOCUSIGN_SECRET
  );
}

export type SignRequest = {
  documentHtml: string;
  documentName: string;
  recipientEmail: string;
  recipientName: string;
};
export type SignResult = { ok: boolean; skipped?: boolean; envelopeId?: string; error?: string };

export async function sendForSignature(req: SignRequest): Promise<SignResult> {
  if (!req.recipientEmail) return { ok: false, error: "No recipient email on this record." };
  if (!docusignConfigured()) {
    console.log(`[docusign:skipped] → ${req.recipientEmail} · ${req.documentName}`);
    return { ok: false, skipped: true };
  }
  // TODO: real DocuSign envelope creation + send:
  //   authenticate (JWT) → EnvelopesApi.createEnvelope({ documents:[{documentBase64,...}],
  //   recipients:{ signers:[{ email, name, recipientId, tabs }] }, status:'sent' })
  return { ok: false, error: "DocuSign keys present but live integration not wired yet." };
}
