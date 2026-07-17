"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/guard";
import { runAutomations } from "@/lib/automation";
import { sendMail, mailerConfigured } from "@/lib/mailer";

// ── Save form config (board editors) ─────────────────────────
export async function saveFormConfig(
  boardId: string,
  cfg: {
    enabled: boolean;
    title: string;
    desc: string;
    columns: string[];
    dedupeColumnId: string | null;
    groupId?: string | null;
    welcomeMessage?: string;
  }
) {
  await requireEditor();
  // Give the form a short shareable slug the first time it's enabled.
  let slug: string | undefined;
  if (cfg.enabled) {
    const existing = await db.board.findUnique({
      where: { id: boardId },
      select: { formSlug: true },
    });
    if (!existing?.formSlug) {
      for (let i = 0; i < 5; i++) {
        const candidate = Math.random().toString(36).slice(2, 8);
        const clash = await db.board.findUnique({ where: { formSlug: candidate }, select: { id: true } });
        if (!clash) {
          slug = candidate;
          break;
        }
      }
    }
  }
  await db.board.update({
    where: { id: boardId },
    data: {
      formEnabled: cfg.enabled,
      formTitle: cfg.title,
      formDesc: cfg.desc,
      ...(slug ? { formSlug: slug } : {}),
      formConfig: JSON.stringify({
        columns: cfg.columns,
        dedupeColumnId: cfg.dedupeColumnId,
        groupId: cfg.groupId ?? null,
        welcomeMessage: cfg.welcomeMessage ?? "",
      }),
    },
  });
  revalidatePath(`/boards/${boardId}`);
  revalidatePath(`/form/${boardId}`);
}

// ── Multiple forms per board (create / edit / delete) ────────
import type { FormAppearance } from "@/lib/board-types";

type FormCfg = {
  columns?: string[];
  dedupeColumnId?: string | null;
  groupId?: string | null;
  welcomeMessage?: string;
  appearance?: FormAppearance;
};

async function freshSlug(): Promise<string | undefined> {
  for (let i = 0; i < 6; i++) {
    const c = Math.random().toString(36).slice(2, 8);
    const [b, f] = await Promise.all([
      db.board.findUnique({ where: { formSlug: c }, select: { id: true } }),
      db.form.findUnique({ where: { slug: c }, select: { id: true } }),
    ]);
    if (!b && !f) return c;
  }
  return undefined;
}

export async function createForm(boardId: string, title: string) {
  await requireEditor();
  const count = await db.form.count({ where: { boardId } });
  const slug = await freshSlug();
  const form = await db.form.create({
    data: { boardId, title: title.trim() || "New form", position: count, slug, config: "{}" },
  });
  revalidatePath(`/boards/${boardId}`);
  return form.id;
}

export async function updateForm(
  formId: string,
  data: { title: string; desc: string; enabled: boolean; config: FormCfg }
) {
  await requireEditor();
  const form = await db.form.findUnique({ where: { id: formId }, select: { boardId: true, slug: true } });
  if (!form) return;
  const slug = form.slug ?? (await freshSlug());
  await db.form.update({
    where: { id: formId },
    data: {
      title: data.title,
      desc: data.desc,
      enabled: data.enabled,
      ...(slug ? { slug } : {}),
      config: JSON.stringify(data.config),
    },
  });
  revalidatePath(`/boards/${form.boardId}`);
}

export async function deleteForm(formId: string) {
  await requireEditor();
  const form = await db.form.findUnique({ where: { id: formId }, select: { boardId: true } });
  if (!form) return;
  await db.form.delete({ where: { id: formId } });
  revalidatePath(`/boards/${form.boardId}`);
}

// Generate a fresh shortened public URL (/f/<slug>) for a form (Missing #3).
export async function regenerateFormSlug(formId: string): Promise<string | null> {
  await requireEditor();
  const form = await db.form.findUnique({ where: { id: formId }, select: { boardId: true } });
  if (!form) return null;
  const slug = await freshSlug();
  if (!slug) return null;
  await db.form.update({ where: { id: formId }, data: { slug } });
  revalidatePath(`/boards/${form.boardId}`);
  return slug;
}

// Set a custom, branded shortened URL for a form (Additional #1 + Improvement #3).
export type SlugResult = { ok: boolean; slug?: string; error?: string };
export async function setFormSlug(formId: string, raw: string): Promise<SlugResult> {
  await requireEditor();
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length < 3) return { ok: false, error: "Use at least 3 characters (letters, numbers, hyphens)." };
  if (slug.length > 40) return { ok: false, error: "Keep it under 40 characters." };
  const form = await db.form.findUnique({ where: { id: formId }, select: { boardId: true } });
  if (!form) return { ok: false, error: "Form not found." };
  const [boardClash, formClash] = await Promise.all([
    db.board.findUnique({ where: { formSlug: slug }, select: { id: true } }),
    db.form.findFirst({ where: { slug, NOT: { id: formId } }, select: { id: true } }),
  ]);
  if (boardClash || formClash) return { ok: false, error: "That link is already taken — try another." };
  await db.form.update({ where: { id: formId }, data: { slug } });
  revalidatePath(`/boards/${form.boardId}`);
  return { ok: true, slug };
}

// ── Public submission (no auth) with de-dup by a chosen column ─
export type SubmitState = { ok: boolean; error?: string; message?: string };

// Shared submission core used by both the legacy board form and named forms.
async function runSubmission(boardId: string, cfg: FormCfg, formData: FormData): Promise<SubmitState> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    include: { columns: true, groups: { orderBy: { position: "asc" } }, environment: true },
  });
  if (!board) return { ok: false, error: "This form is not available." };
  const includedIds = cfg.columns ?? [];
  const includedCols = board.columns.filter((c) => includedIds.includes(c.id));

  const name = String(formData.get("__name") ?? "").trim();
  if (!name) return { ok: false, error: "Please enter your name." };

  // Collect values for included, form-friendly columns.
  const values: { columnId: string; value: string | null }[] = [];
  for (const c of includedCols) {
    if (c.type === "person" || c.type === "file") continue;
    const raw = String(formData.get(c.id) ?? "").trim();
    values.push({ columnId: c.id, value: raw || null });
  }

  // De-dup: if a dedupe column is set and its value matches an existing item, update it.
  const dedupeId = cfg.dedupeColumnId ?? null;
  let existingItemId: string | null = null;
  if (dedupeId) {
    const dedupeVal = values.find((v) => v.columnId === dedupeId)?.value;
    if (dedupeVal) {
      const found = await db.item.findFirst({
        where: { boardId, cells: { some: { columnId: dedupeId, value: dedupeVal } } },
        select: { id: true },
      });
      existingItemId = found?.id ?? null;
    }
  }

  let finalItemId: string;
  let message: string;

  if (existingItemId) {
    // Update existing record — no duplicate created.
    await db.item.update({ where: { id: existingItemId }, data: { name } });
    for (const v of values) {
      await db.cell.upsert({
        where: { itemId_columnId: { itemId: existingItemId, columnId: v.columnId } },
        create: { itemId: existingItemId, columnId: v.columnId, value: v.value },
        update: { value: v.value },
      });
    }
    finalItemId = existingItemId;
    message = "Thanks! Your details were updated.";
  } else {
    // Create a new item in the chosen destination group (else the first group).
    const group =
      board.groups.find((g) => g.id === cfg.groupId) ?? board.groups[0];
    if (!group) return { ok: false, error: "This board has no group to receive submissions." };
    const count = await db.item.count({ where: { groupId: group.id } });
    const item = await db.item.create({
      data: { boardId, groupId: group.id, name, position: count },
    });
    for (const v of values) {
      if (v.value !== null)
        await db.cell.create({ data: { itemId: item.id, columnId: v.columnId, value: v.value } });
    }
    // Team notification (NotWorking #1): record the submission on the item so the
    // team sees a new-submission entry in the activity/updates timeline.
    await db.update.create({
      data: {
        itemId: item.id,
        body: `📥 New form submission received — ${name}.`,
        mentions: "[]",
      },
    });
    // Automations must never block the submitter's confirmation — if a rule
    // errors, log it and still return success.
    try {
      await runAutomations({ type: "item_created", boardId, itemId: item.id });
    } catch (e) {
      console.error("[form:automation-error]", e);
    }
    finalItemId = item.id;
    message = cfg.welcomeMessage?.trim() || "Thanks! Your submission was received.";
  }

  // Cross-board connect (Part 10): link this submission to a matching item on
  // each connected board by email — no duplicate, just a link. Wrapped so a
  // linking error can never block the submitter's confirmation.
  try {
  const emailCol = board.columns.find((c) => c.type === "email");
  const submittedEmail = emailCol
    ? values.find((v) => v.columnId === emailCol.id)?.value
    : null;
  if (submittedEmail) {
    for (const cc of board.columns.filter((c) => c.type === "connection")) {
      let tb = "";
      try {
        tb = JSON.parse(cc.config).targetBoardId ?? "";
      } catch {}
      if (!tb) continue;
      const targetEmailCol = await db.column.findFirst({
        where: { boardId: tb, type: "email" },
      });
      if (!targetEmailCol) continue;
      const match = await db.item.findFirst({
        where: {
          boardId: tb,
          cells: { some: { columnId: targetEmailCol.id, value: submittedEmail } },
        },
        select: { id: true },
      });
      if (match) {
        await db.cell.upsert({
          where: { itemId_columnId: { itemId: finalItemId, columnId: cc.id } },
          create: { itemId: finalItemId, columnId: cc.id, value: match.id },
          update: { value: match.id },
        });
      }
    }
  }
  } catch (e) {
    console.error("[form:connect-error]", e);
  }

  // Confirmation email to the submitter (if they gave an email address) and a
  // record on the item's conversation history. No-op / logged until SMTP works.
  try {
    const emailCol2 = board.columns.find((c) => c.type === "email");
    const toEmail = emailCol2
      ? values.find((v) => v.columnId === emailCol2.id)?.value ?? null
      : null;
    if (toEmail) {
      const subject = `We received your submission — ${board.name}`;
      const bodyText = `${message}\n\nHi ${name}, thanks for your submission to ${board.name}. Our team will be in touch.`;
      const res = await sendMail({
        to: toEmail,
        subject,
        html: `<p>Hi ${name},</p><p>${message}</p><p>Our team will be in touch shortly.</p><p>— ${board.name}</p>`,
        text: bodyText,
      });
      await db.emailMessage.create({
        data: {
          orgId: board.environment.orgId,
          itemId: finalItemId,
          direction: "outbound",
          status: res.ok ? "sent" : mailerConfigured() ? "failed" : "logged",
          fromEmail: process.env.SMTP_FROM || "",
          toEmail,
          subject,
          body: bodyText,
        },
      });
    }
  } catch (e) {
    console.error("[form:confirm-email-error]", e);
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true, message };
}

// Legacy single board form (board.formConfig).
export async function submitForm(
  boardId: string,
  _prev: SubmitState | null,
  formData: FormData
): Promise<SubmitState> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { formEnabled: true, formConfig: true },
  });
  if (!board || !board.formEnabled) return { ok: false, error: "This form is not available." };
  let cfg: FormCfg = {};
  try {
    cfg = JSON.parse(board.formConfig);
  } catch {}
  return runSubmission(boardId, cfg, formData);
}

// A named form (Form row) — resolved by its id.
export async function submitFormById(
  formId: string,
  _prev: SubmitState | null,
  formData: FormData
): Promise<SubmitState> {
  const form = await db.form.findUnique({ where: { id: formId } });
  if (!form || !form.enabled) return { ok: false, error: "This form is not available." };
  let cfg: FormCfg = {};
  try {
    cfg = JSON.parse(form.config);
  } catch {}
  return runSubmission(form.boardId, cfg, formData);
}
