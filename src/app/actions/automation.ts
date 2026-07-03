"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/guard";

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
  await requireEditor();
  await db.automation.create({
    data: {
      boardId,
      name: input.name.trim() || "Untitled automation",
      folder: input.folder.trim(),
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
  await requireEditor();
  await db.automation.update({
    where: { id },
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
  await requireEditor();
  await db.automation.update({ where: { id }, data: { enabled } });
  touch(boardId);
}

// Rename a folder (moves all its automations to the new folder name).
export async function renameFolder(boardId: string, from: string, to: string) {
  await requireEditor();
  const target = to.trim();
  if (!target) return;
  await db.automation.updateMany({
    where: { boardId, folder: from === "General" ? "" : from },
    data: { folder: target },
  });
  touch(boardId);
}

export async function deleteAutomation(boardId: string, id: string) {
  await requireEditor();
  await db.automation.delete({ where: { id } });
  touch(boardId);
}
