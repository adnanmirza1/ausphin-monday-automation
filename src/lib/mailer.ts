import "server-only";

// SMTP email. Configure via env to enable real sending:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (optional)
// Until configured, sendMail() is a safe no-op that logs — so the app's email
// paths (finance invoices, notifications) run without failing in dev.

export function mailerConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export type MailAttachment = { filename: string; contentBase64: string; contentType?: string };
export type Mail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string; // overrides SMTP_FROM (subject to provider alias rules)
  cc?: string;
  bcc?: string;
  attachments?: MailAttachment[];
};
export type MailResult = { ok: boolean; skipped?: boolean; error?: string };

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!mail.to && !mail.cc && !mail.bcc) return { ok: false, error: "No recipient." };
  if (!mailerConfigured()) {
    console.log(`[mailer:skipped] → ${mail.to} · ${mail.subject}`);
    return { ok: false, skipped: true };
  }
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
      // Gmail/Workspace may rewrite From to the authenticated account unless the
      // address is a verified "send-as" alias — so keep the account as fallback.
      from: mail.from || process.env.SMTP_FROM || process.env.SMTP_USER,
      to: mail.to || undefined,
      cc: mail.cc || undefined,
      bcc: mail.bcc || undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.attachments?.map((a) => ({
        filename: a.filename,
        content: a.contentBase64,
        encoding: "base64",
        contentType: a.contentType,
      })),
    });
    return { ok: true };
  } catch (e) {
    console.error("[mailer:error]", e);
    return { ok: false, error: String(e) };
  }
}
