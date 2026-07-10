"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor, requireUser } from "@/lib/guard";
import { sendMail, mailerConfigured } from "@/lib/mailer";

export type EmailRow = {
  id: string;
  direction: string;
  status: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  authorName: string;
  authorColor: string;
  createdAt: string;
};

export type SendEmailResult = {
  ok: boolean;
  delivered: boolean; // true when SMTP actually sent; false when logged only
  error?: string;
};

function mapRow(r: {
  id: string;
  direction: string;
  status: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  createdAt: Date;
  author: { name: string; avatarColor: string } | null;
}): EmailRow {
  return {
    id: r.id,
    direction: r.direction,
    status: r.status,
    fromEmail: r.fromEmail,
    toEmail: r.toEmail,
    subject: r.subject,
    body: r.body,
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
export async function sendItemEmail(
  boardId: string,
  itemId: string,
  to: string,
  subject: string,
  body: string
): Promise<SendEmailResult> {
  const user = await requireEditor();
  const recipient = to.trim();
  if (!recipient) return { ok: false, delivered: false, error: "Enter a recipient email." };
  if (!subject.trim() && !body.trim())
    return { ok: false, delivered: false, error: "Enter a subject or message." };

  const html = `<p>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`;
  const res = await sendMail({ to: recipient, subject: subject.trim() || "(no subject)", html, text: body });

  const delivered = res.ok === true;
  const status = delivered ? "sent" : mailerConfigured() ? "failed" : "sent";

  await db.emailMessage.create({
    data: {
      orgId: user.orgId,
      itemId,
      direction: "outbound",
      status,
      fromEmail: process.env.SMTP_FROM || user.email,
      toEmail: recipient,
      subject: subject.trim(),
      body,
      authorId: user.id,
    },
  });

  revalidatePath(`/boards/${boardId}`);
  return { ok: true, delivered };
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
