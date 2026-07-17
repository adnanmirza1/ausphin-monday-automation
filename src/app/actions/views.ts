"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/guard";

function touch(boardId: string) {
  revalidatePath(`/boards/${boardId}`);
}

export type ViewType = "table" | "kanban" | "calendar" | "chart" | "dashboard";

export type ViewConfig = {
  hiddenColumns?: string[];
  filters?: { columnId: string; value: string }[];
  widgets?: unknown[]; // dashboard views only
  dashBoards?: string[]; // dashboard-level connected boards (monday-style)
  dashFilters?: unknown[]; // dashboard-level filters, inherited by all widgets
};

function defaultName(type: ViewType): string {
  return { table: "Table", kanban: "Kanban", calendar: "Calendar", chart: "Chart", dashboard: "Dashboard" }[type];
}

// Create a persistent, typed view tab. Returns the new view id. An optional
// client-generated id lets the UI add the tab optimistically (no wait for the
// server round-trip) while the row is written with the same id.
export async function createView(
  boardId: string,
  name: string,
  type: ViewType,
  config: ViewConfig = {},
  id?: string
): Promise<string> {
  await requireEditor();
  const count = await db.boardView.count({ where: { boardId } });
  const view = await db.boardView.create({
    data: {
      ...(id ? { id } : {}),
      boardId,
      name: name.trim() || defaultName(type),
      type,
      config: JSON.stringify(config),
      position: count,
    },
  });
  touch(boardId);
  return view.id;
}

export async function renameView(boardId: string, id: string, name: string) {
  await requireEditor();
  const trimmed = name.trim();
  if (!trimmed) return;
  await db.boardView.update({ where: { id }, data: { name: trimmed } });
  touch(boardId);
}

// Persist a view's config (filters/hidden columns, or dashboard widgets).
export async function updateViewConfig(boardId: string, id: string, config: ViewConfig) {
  await requireEditor();
  await db.boardView.update({ where: { id }, data: { config: JSON.stringify(config) } });
  touch(boardId);
}

// Reorder views to the given id order (persisted).
export async function reorderViews(boardId: string, orderedIds: string[]) {
  await requireEditor();
  await Promise.all(
    orderedIds.map((id, i) =>
      db.boardView.updateMany({ where: { id, boardId }, data: { position: i } })
    )
  );
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
