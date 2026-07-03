"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/guard";
import { runAutomations } from "@/lib/automation";

// ── Save form config (board editors) ─────────────────────────
export async function saveFormConfig(
  boardId: string,
  cfg: {
    enabled: boolean;
    title: string;
    desc: string;
    columns: string[];
    dedupeColumnId: string | null;
  }
) {
  await requireEditor();
  await db.board.update({
    where: { id: boardId },
    data: {
      formEnabled: cfg.enabled,
      formTitle: cfg.title,
      formDesc: cfg.desc,
      formConfig: JSON.stringify({
        columns: cfg.columns,
        dedupeColumnId: cfg.dedupeColumnId,
      }),
    },
  });
  revalidatePath(`/boards/${boardId}`);
  revalidatePath(`/form/${boardId}`);
}

// ── Public submission (no auth) with de-dup by a chosen column ─
export type SubmitState = { ok: boolean; error?: string; message?: string };

export async function submitForm(
  boardId: string,
  _prev: SubmitState | null,
  formData: FormData
): Promise<SubmitState> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    include: {
      columns: true,
      groups: { orderBy: { position: "asc" }, take: 1 },
    },
  });
  if (!board || !board.formEnabled) return { ok: false, error: "This form is not available." };

  let cfg: { columns?: string[]; dedupeColumnId?: string | null } = {};
  try {
    cfg = JSON.parse(board.formConfig);
  } catch {}
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
    // Create a new item in the first group.
    const group = board.groups[0];
    if (!group) return { ok: false, error: "This board has no group to receive submissions." };
    const count = await db.item.count({ where: { groupId: group.id } });
    const item = await db.item.create({
      data: { boardId, groupId: group.id, name, position: count },
    });
    for (const v of values) {
      if (v.value !== null)
        await db.cell.create({ data: { itemId: item.id, columnId: v.columnId, value: v.value } });
    }
    await runAutomations({ type: "item_created", boardId, itemId: item.id });
    finalItemId = item.id;
    message = "Thanks! Your submission was received.";
  }

  // Cross-board connect (Part 10): link this submission to a matching item on
  // each connected board by email — no duplicate, just a link.
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

  revalidatePath(`/boards/${boardId}`);
  return { ok: true, message };
}
