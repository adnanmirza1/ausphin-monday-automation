"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/guard";

function touch(boardId: string) {
  revalidatePath(`/boards/${boardId}`);
}

export type ViewConfig = {
  hiddenColumns: string[];
  filters: { columnId: string; value: string }[];
};

export async function createView(boardId: string, name: string, config: ViewConfig) {
  await requireEditor();
  const count = await db.boardView.count({ where: { boardId } });
  await db.boardView.create({
    data: {
      boardId,
      name: name.trim() || "New view",
      config: JSON.stringify(config),
      position: count,
    },
  });
  touch(boardId);
}

export async function deleteView(boardId: string, id: string) {
  await requireEditor();
  await db.boardView.delete({ where: { id } });
  touch(boardId);
}

// Pin exactly one view as the board default (or unpin if already pinned).
export async function pinView(boardId: string, id: string, pinned: boolean) {
  await requireEditor();
  await db.boardView.updateMany({ where: { boardId }, data: { isPinned: false } });
  if (pinned) await db.boardView.update({ where: { id }, data: { isPinned: true } });
  touch(boardId);
}
