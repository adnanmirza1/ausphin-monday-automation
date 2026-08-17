"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBoardEditor, requireBoardAccessAsUser } from "@/lib/guard";

export type UpdateRow = {
  id: string;
  body: string;
  authorName: string;
  authorColor: string;
  mentionNames: string[];
  createdAt: string;
};

export async function getItemUpdates(boardId: string, itemId: string): Promise<UpdateRow[]> {
  const user = await requireBoardAccessAsUser(boardId);
  const updates = await db.update.findMany({
    where: { itemId, item: { boardId } },
    orderBy: { createdAt: "desc" },
    include: { author: true },
  });

  // Resolve mention ids (departments or users) to display names.
  const deptIds = new Set<string>();
  for (const u of updates) {
    try {
      (JSON.parse(u.mentions) as string[]).forEach((id) => deptIds.add(id));
    } catch {}
  }
  const depts = await db.department.findMany({
    where: { id: { in: [...deptIds] }, orgId: user.orgId },
    select: { id: true, name: true },
  });
  const deptName = new Map(depts.map((d) => [d.id, d.name]));

  return updates.map((u) => {
    let mentionNames: string[] = [];
    try {
      mentionNames = (JSON.parse(u.mentions) as string[])
        .map((id) => deptName.get(id))
        .filter(Boolean) as string[];
    } catch {}
    return {
      id: u.id,
      body: u.body,
      authorName: u.author?.name ?? "System",
      authorColor: u.author?.avatarColor ?? "#8792A2",
      mentionNames,
      createdAt: u.createdAt.toISOString(),
    };
  });
}

export async function addUpdate(
  boardId: string,
  itemId: string,
  body: string,
  mentions: string[]
) {
  const user = await requireBoardEditor(boardId);
  const item = await db.item.findFirst({ where: { id: itemId, boardId }, select: { id: true } });
  if (!item) throw new Error("Item not found on this board.");
  const trimmed = body.trim();
  if (!trimmed) return;
  await db.update.create({
    data: {
      itemId,
      authorId: user.id,
      body: trimmed,
      mentions: JSON.stringify(mentions),
    },
  });
  revalidatePath(`/boards/${boardId}`);
}
