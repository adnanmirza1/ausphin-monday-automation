"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBoardEditor } from "@/lib/guard";

function touch(boardId: string) {
  revalidatePath(`/boards/${boardId}/automations`);
  revalidatePath(`/boards/${boardId}`);
}

export type AutomationInput = {
  name: string;
  folder: string;
  trigger: Record<string, unknown>;
  action: Record<string, unknown>;
};

export async function createAutomation(boardId: string, input: AutomationInput) {
  await requireBoardEditor(boardId);
  const folder = input.folder.trim();
  const count = await db.automation.count({ where: { boardId, folder } });
  await db.automation.create({
    data: {
      boardId,
      name: input.name.trim() || "Untitled automation",
      folder,
      position: count,
      trigger: JSON.stringify(input.trigger),
      action: JSON.stringify(input.action),
    },
  });
  touch(boardId);
}

export async function updateAutomation(
  boardId: string,
  id: string,
  input: AutomationInput
) {
  await requireBoardEditor(boardId);
  await db.automation.updateMany({
    where: { id, boardId },
    data: {
      name: input.name.trim() || "Untitled automation",
      folder: input.folder.trim(),
      trigger: JSON.stringify(input.trigger),
      action: JSON.stringify(input.action),
    },
  });
  touch(boardId);
}

export async function toggleAutomation(
  boardId: string,
  id: string,
  enabled: boolean
) {
  await requireBoardEditor(boardId);
  await db.automation.updateMany({ where: { id, boardId }, data: { enabled } });
  touch(boardId);
}

// Rename a folder (moves all its automations to the new folder name).
export async function renameFolder(boardId: string, from: string, to: string) {
  await requireBoardEditor(boardId);
  const target = to.trim();
  if (!target) return;
  await db.automation.updateMany({
    where: { boardId, folder: from === "General" ? "" : from },
    data: { folder: target },
  });
  touch(boardId);
}

export async function deleteAutomation(boardId: string, id: string) {
  await requireBoardEditor(boardId);
  await db.automation.deleteMany({ where: { id, boardId } });
  touch(boardId);
}

// Drag-and-drop: move an automation into `targetFolder` and place it before
// `beforeId` (or at the end when null), reindexing that folder's positions.
// "General" is the display name for the empty-folder bucket.
export async function moveAutomation(
  boardId: string,
  id: string,
  targetFolder: string,
  beforeId: string | null
) {
  await requireBoardEditor(boardId);
  const folder = targetFolder === "General" ? "" : targetFolder.trim();

  // Put the dragged automation into the target folder first (scoped to this
  // board so a foreign automation id can't be adopted onto it).
  await db.automation.updateMany({ where: { id, boardId }, data: { folder } });

  const existing = await db.automation.findMany({
    where: { boardId, folder },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const ids = existing.map((a) => a.id).filter((x) => x !== id);
  const at = beforeId ? ids.indexOf(beforeId) : ids.length;
  ids.splice(at === -1 ? ids.length : at, 0, id);

  for (let i = 0; i < ids.length; i++) {
    await db.automation.update({ where: { id: ids[i] }, data: { position: i } });
  }
  touch(boardId);
}
