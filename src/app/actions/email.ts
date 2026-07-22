"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor, requireUser } from "@/lib/guard";
import { sendMail, mailerConfigured } from "@/lib/mailer";

export type EmailAttachment = { name: string; type?: string; dataUrl: string };

export type EmailRow = {
  id: string;
  direction: string;
  status: string;
  fromEmail: string;
  toEmail: string;
  ccEmail: string;
  bccEmail: string;
  subject: string;
  body: string;
  attachments: { name: string }[];
  authorName: string;
  authorColor: string;
  createdAt: string;
};

export type SendEmailResult = {
  ok: boolean; // request was valid & recorded
  delivered: boolean; // true only when SMTP actually accepted the message
  configured: boolean; // whether SMTP is set up at all
  error?: string; // delivery error (when configured but send failed)
};

// Authorized "From" addresses for the composer: the signed-in user's own email
// plus the org's configured sender. Real delivery still routes through the one
// configured SMTP account (a provider may rewrite From unless it's a verified
// send-as alias) — the dropdown selects which address is presented.
export async function getEmailSenders(): Promise<string[]> {
  const user = await requireUser();
  const list = [user.email, process.env.SMTP_FROM].filter((s): s is string => !!s);
  return [...new Set(list)];
}

function mapRow(r: {
  id: string;
  direction: string;
  status: string;
  fromEmail: string;
  toEmail: string;
  ccEmail: string;
  bccEmail: string;
  subject: string;
  body: string;
  attachments: string;
  createdAt: Date;
  author: { name: string; avatarColor: string } | null;
}): EmailRow {
  let attachments: { name: string }[] = [];
  try {
    attachments = JSON.parse(r.attachments) ?? [];
  } catch {}
  return {
    id: r.id,
    direction: r.direction,
    status: r.status,
    fromEmail: r.fromEmail,
    toEmail: r.toEmail,
    ccEmail: r.ccEmail,
    bccEmail: r.bccEmail,
    subject: r.subject,
    body: r.body,
    attachments,
    authorName: r.author?.name ?? "System",
    authorColor: r.author?.avatarColor ?? "#8792A2",
    createdAt: r.createdAt.toISOString(),
  };
}

// Full conversation history for an item/candidate profile (newest first).
// Scoped to the caller's org so one org can't read another's threads.
export async function getItemEmails(itemId: string): Promise<EmailRow[]> {
  const user = await requireUser();
  const rows = await db.emailMessage.findMany({
    where: { itemId, orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    include: { author: true },
  });
  return rows.map(mapRow);
}

// Conversation history + a suggested recipient (the item's email cell), for the
// candidate profile drawer.
export async function getItemInbox(
  itemId: string
): Promise<{ to: string; emails: EmailRow[] }> {
  const user = await requireUser();
  const [rows, emailCell] = await Promise.all([
    db.emailMessage.findMany({
      where: { itemId, orgId: user.orgId },
      orderBy: { createdAt: "desc" },
      include: { author: true },
    }),
    // Only surface the recipient if the item belongs to the caller's org.
    db.cell.findFirst({
      where: {
        itemId,
        column: { type: "email" },
        value: { not: null },
        item: { board: { environment: { orgId: user.orgId } } },
      },
      select: { value: true },
    }),
  ]);
  return { to: emailCell?.value ?? "", emails: rows.map(mapRow) };
}

// Compose + send an email from the platform to a candidate/user, and record it
// on the item's conversation history (Improvement #2 + Missing #2).
export type SendEmailInput = {
  from?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
};

const MAX_ATTACH_TOTAL = 8 * 1024 * 1024; // 8 MB total across attachments

export async function sendItemEmail(
  boardId: string,
  itemId: string,
  input: SendEmailInput
): Promise<SendEmailResult> {
  const user = await requireEditor();
  const configured = mailerConfigured();
  const recipient = input.to.trim();
  const cc = (input.cc ?? "").trim();
  const bcc = (input.bcc ?? "").trim();
  if (!recipient && !cc && !bcc)
    return { ok: false, delivered: false, configured, error: "Enter at least one recipient (To, CC, or BCC)." };
  if (!input.subject.trim() && !input.body.trim())
    return { ok: false, delivered: false, configured, error: "Enter a subject or message." };

  // Only allow an authorized From address; otherwise fall back to the default.
  const allowed = await getEmailSenders();
  const from = input.from && allowed.includes(input.from) ? input.from : allowed[0];

  const attachments = input.attachments ?? [];
  const totalBytes = attachments.reduce((s, a) => s + Math.ceil((a.dataUrl.length * 3) / 4), 0);
  if (totalBytes > MAX_ATTACH_TOTAL)
    return { ok: false, delivered: false, configured, error: "Attachments exceed 8 MB total." };

  const html = `<p>${input.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`;
  const res = await sendMail({
    from,
    to: recipient,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject: input.subject.trim() || "(no subject)",
    html,
    text: input.body,
    attachments: attachments.map((a) => ({
      filename: a.name,
      contentBase64: a.dataUrl.includes(",") ? a.dataUrl.split(",")[1] : a.dataUrl,
      contentType: a.type,
    })),
  });

  const delivered = res.ok === true;
  const status = delivered ? "sent" : configured ? "failed" : "logged";

  await db.emailMessage.create({
    data: {
      orgId: user.orgId,
      itemId,
      direction: "outbound",
      status,
      fromEmail: from ?? "",
      toEmail: recipient,
      ccEmail: cc,
      bccEmail: bcc,
      subject: input.subject.trim(),
      body: input.body,
      attachments: JSON.stringify(attachments.map((a) => ({ name: a.name }))),
      authorId: user.id,
    },
  });

  revalidatePath(`/boards/${boardId}`);
  return { ok: true, delivered, configured, error: delivered ? undefined : res.error };
}

// Manually log a received reply / note into the conversation (until inbound
// email capture is wired to a provider).
export async function logItemEmail(
  boardId: string,
  itemId: string,
  data: { direction: "inbound" | "note"; fromEmail: string; subject: string; body: string }
): Promise<void> {
  const user = await requireEditor();
  if (!data.body.trim() && !data.subject.trim()) return;
  await db.emailMessage.create({
    data: {
      orgId: user.orgId,
      itemId,
      direction: data.direction,
      status: "sent",
      fromEmail: data.fromEmail.trim(),
      toEmail: "",
      subject: data.subject.trim(),
      body: data.body,
      authorId: user.id,
    },
  });
  revalidatePath(`/boards/${boardId}`);
}
