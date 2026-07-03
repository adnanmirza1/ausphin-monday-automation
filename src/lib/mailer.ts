import "server-only";

// SMTP email. Configure via env to enable real sending:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (optional)
// Until configured, sendMail() is a safe no-op that logs — so the app's email
// paths (finance invoices, notifications) run without failing in dev.

export function mailerConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export type Mail = { to: string; subject: string; html: string; text?: string };
export type MailResult = { ok: boolean; skipped?: boolean; error?: string };

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!mail.to) return { ok: false, error: "No recipient." };
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
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    return { ok: true };
  } catch (e) {
    console.error("[mailer:error]", e);
    return { ok: false, error: String(e) };
  }
}
