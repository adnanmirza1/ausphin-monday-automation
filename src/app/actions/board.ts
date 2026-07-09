"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/guard";
import {
  DEFAULT_STATUS_LABELS,
  PALETTE,
  type ColumnType,
  type StatusLabel,
} from "@/lib/constants";
import { runAutomations } from "@/lib/automation";

function touch(boardId: string) {
  revalidatePath(`/boards/${boardId}`);
}

// Merge a patch into a column's JSON config, dropping keys set to undefined.
async function patchColumnConfig(
  columnId: string,
  patch: Record<string, unknown>
) {
  const col = await db.column.findUnique({ where: { id: columnId } });
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(col?.config || "{}");
  } catch {
    cfg = {};
  }
  const next = { ...cfg, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  await db.column.update({
    where: { id: columnId },
    data: { config: JSON.stringify(next) },
  });
}

// ── Items ────────────────────────────────────────────────────
export async function addItem(boardId: string, groupId: string, name: string) {
  await requireEditor();
  const trimmed = name.trim();
  if (!trimmed) return;
  const count = await db.item.count({ where: { groupId } });
  const item = await db.item.create({
    data: { boardId, groupId, name: trimmed, position: count },
  });

  // Seed cells from any columns that carry a default value.
  const columns = await db.column.findMany({ where: { boardId } });
  const seeds = columns
    .map((c) => {
      let dv: string | undefined;
      try {
        dv = JSON.parse(c.config || "{}").defaultValue;
      } catch {
        dv = undefined;
      }
      return dv ? { columnId: c.id, type: c.type, value: dv } : null;
    })
    .filter((s): s is { columnId: string; type: string; value: string } => !!s);
  if (seeds.length) {
    await db.cell.createMany({
      data: seeds.map((s) => ({
        itemId: item.id,
        columnId: s.columnId,
        value: s.value,
        personId: s.type === "person" ? s.value : null,
      })),
    });
  }

  await runAutomations({ type: "item_created", boardId, itemId: item.id });
  touch(boardId);
}

export async function renameItem(boardId: string, itemId: string, name: string) {
  await requireEditor();
  await db.item.update({ where: { id: itemId }, data: { name: name.trim() } });
  touch(boardId);
}

export async function deleteItem(boardId: string, itemId: string) {
  await requireEditor();
  await db.item.delete({ where: { id: itemId } });
  touch(boardId);
}

export async function moveItemToGroup(
  boardId: string,
  itemId: string,
  groupId: string
) {
  await requireEditor();
  const count = await db.item.count({ where: { groupId } });
  await db.item.update({
    where: { id: itemId },
    data: { groupId, position: count },
  });
  touch(boardId);
}

// Bulk actions on many selected items at once (Part: bulk selection).
export async function bulkDeleteItems(boardId: string, itemIds: string[]) {
  await requireEditor();
  if (itemIds.length === 0) return;
  await db.item.deleteMany({ where: { id: { in: itemIds }, boardId } });
  touch(boardId);
}

export async function bulkMoveItems(
  boardId: string,
  itemIds: string[],
  groupId: string
) {
  await requireEditor();
  if (itemIds.length === 0) return;
  let count = await db.item.count({ where: { groupId } });
  for (const id of itemIds) {
    await db.item.update({ where: { id }, data: { groupId, position: count++ } });
  }
  touch(boardId);
}

// Drag-and-drop: place `itemId` into `targetGroupId` before `beforeItemId`
// (or at the end when null), then reindex positions of that group.
export async function reorderItem(
  boardId: string,
  itemId: string,
  targetGroupId: string,
  beforeItemId: string | null
) {
  await requireEditor();
  if (itemId === beforeItemId) return;

  const existing = await db.item.findMany({
    where: { groupId: targetGroupId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const ids = existing.map((i) => i.id).filter((id) => id !== itemId);
  const at = beforeItemId ? ids.indexOf(beforeItemId) : ids.length;
  ids.splice(at === -1 ? ids.length : at, 0, itemId);

  for (let i = 0; i < ids.length; i++) {
    await db.item.update({
      where: { id: ids[i] },
      data: { position: i, ...(ids[i] === itemId ? { groupId: targetGroupId } : {}) },
    });
  }
  touch(boardId);
}

// ── Cells ────────────────────────────────────────────────────
export async function setCell(
  boardId: string,
  itemId: string,
  columnId: string,
  value: string | null
) {
  await requireEditor();
  await db.cell.upsert({
    where: { itemId_columnId: { itemId, columnId } },
    create: { itemId, columnId, value },
    update: { value },
  });
  // Fire status-change automations when a status column changes.
  const column = await db.column.findUnique({ where: { id: columnId } });
  if (column?.type === "status") {
    await runAutomations({ type: "status_changes", boardId, itemId, columnId, value });
  }
  touch(boardId);
}

export async function setPersonCell(
  boardId: string,
  itemId: string,
  columnId: string,
  personId: string | null
) {
  await requireEditor();
  await db.cell.upsert({
    where: { itemId_columnId: { itemId, columnId } },
    create: { itemId, columnId, personId, value: personId },
    update: { personId, value: personId },
  });
  touch(boardId);
}

// ── Groups ───────────────────────────────────────────────────
export async function addGroup(boardId: string, name: string) {
  await requireEditor();
  const count = await db.group.count({ where: { boardId } });
  await db.group.create({
    data: { boardId, name: name.trim() || "New Group", position: count },
  });
  touch(boardId);
}

export async function renameGroup(boardId: string, groupId: string, name: string) {
  await requireEditor();
  await db.group.update({ where: { id: groupId }, data: { name: name.trim() } });
  touch(boardId);
}

export async function setGroupColor(
  boardId: string,
  groupId: string,
  color: string
) {
  await requireEditor();
  await db.group.update({ where: { id: groupId }, data: { color } });
  touch(boardId);
}

export async function deleteGroup(boardId: string, groupId: string) {
  await requireEditor();
  await db.group.delete({ where: { id: groupId } });
  touch(boardId);
}

// Drag-reorder groups: place groupId before beforeGroupId (null = end).
export async function reorderGroup(
  boardId: string,
  groupId: string,
  beforeGroupId: string | null
) {
  await requireEditor();
  if (groupId === beforeGroupId) return;
  const existing = await db.group.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const ids = existing.map((g) => g.id).filter((id) => id !== groupId);
  const at = beforeGroupId ? ids.indexOf(beforeGroupId) : ids.length;
  ids.splice(at === -1 ? ids.length : at, 0, groupId);
  for (let i = 0; i < ids.length; i++) {
    await db.group.update({ where: { id: ids[i] }, data: { position: i } });
  }
  touch(boardId);
}

// ── Columns ──────────────────────────────────────────────────
export async function addColumn(
  boardId: string,
  name: string,
  type: ColumnType,
  extraConfig?: Record<string, unknown>,
  afterColumnId?: string
) {
  await requireEditor();
  const count = await db.column.count({ where: { boardId } });
  let config = "{}";
  if (type === "status") config = JSON.stringify({ labels: DEFAULT_STATUS_LABELS });
  else if (extraConfig) config = JSON.stringify(extraConfig);

  // Insert right after `afterColumnId` (shifting later columns), else append.
  let position = count;
  if (afterColumnId) {
    const after = await db.column.findUnique({ where: { id: afterColumnId } });
    if (after) {
      position = after.position + 1;
      await db.column.updateMany({
        where: { boardId, position: { gte: position } },
        data: { position: { increment: 1 } },
      });
    }
  }
  await db.column.create({
    data: { boardId, name: name.trim() || "New Column", type, position, config },
  });
  touch(boardId);
}

// Copy a column (name + type + config, not cell values) directly to its right.
export async function duplicateColumn(boardId: string, columnId: string) {
  await requireEditor();
  const col = await db.column.findUnique({ where: { id: columnId } });
  if (!col) return;
  await db.column.updateMany({
    where: { boardId, position: { gt: col.position } },
    data: { position: { increment: 1 } },
  });
  await db.column.create({
    data: {
      boardId,
      name: `${col.name} copy`,
      type: col.type,
      config: col.config,
      position: col.position + 1,
    },
  });
  touch(boardId);
}

export async function setColumnDescription(
  boardId: string,
  columnId: string,
  description: string
) {
  await requireEditor();
  await patchColumnConfig(columnId, { description: description.trim() || undefined });
  touch(boardId);
}

export async function setColumnRequired(
  boardId: string,
  columnId: string,
  required: boolean
) {
  await requireEditor();
  await patchColumnConfig(columnId, { required: required || undefined });
  touch(boardId);
}

export async function setColumnDefault(
  boardId: string,
  columnId: string,
  value: string | null
) {
  await requireEditor();
  await patchColumnConfig(columnId, { defaultValue: value || undefined });
  touch(boardId);
}

// Physically reorder items within every group by this column's value.
// Status columns sort by label order; numbers numerically; else naturally.
// Empty values always sort last (regardless of direction).
export async function sortItemsByColumn(
  boardId: string,
  columnId: string,
  dir: "asc" | "desc"
) {
  await requireEditor();
  const col = await db.column.findUnique({ where: { id: columnId } });
  if (!col) return;

  const labelOrder: Record<string, number> = {};
  if (col.type === "status") {
    try {
      const labels: StatusLabel[] = JSON.parse(col.config).labels ?? [];
      labels.forEach((l, i) => (labelOrder[l.id] = i));
    } catch {
      /* ignore */
    }
  }

  const rank = (v: string | null): number | string | null => {
    if (v == null || v === "") return null;
    if (col.type === "status") return labelOrder[v] ?? Number.MAX_SAFE_INTEGER;
    if (col.type === "number") {
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    }
    return v.toLowerCase();
  };

  const groups = await db.group.findMany({
    where: { boardId },
    select: { id: true },
  });
  for (const g of groups) {
    const items = await db.item.findMany({
      where: { groupId: g.id },
      include: { cells: { where: { columnId }, select: { value: true } } },
    });
    const keyed = items.map((it) => ({ id: it.id, k: rank(it.cells[0]?.value ?? null) }));
    keyed.sort((a, b) => {
      if (a.k == null && b.k == null) return 0;
      if (a.k == null) return 1; // empties last
      if (b.k == null) return -1;
      const r = a.k < b.k ? -1 : a.k > b.k ? 1 : 0;
      return dir === "desc" ? -r : r;
    });
    for (let i = 0; i < keyed.length; i++) {
      await db.item.update({ where: { id: keyed[i].id }, data: { position: i } });
    }
  }
  touch(boardId);
}

export async function renameColumn(
  boardId: string,
  columnId: string,
  name: string
) {
  await requireEditor();
  await db.column.update({ where: { id: columnId }, data: { name: name.trim() } });
  touch(boardId);
}

export async function deleteColumn(boardId: string, columnId: string) {
  await requireEditor();
  await db.column.delete({ where: { id: columnId } });
  touch(boardId);
}

// Drag-reorder columns: place columnId before beforeColumnId (null = end).
export async function reorderColumn(
  boardId: string,
  columnId: string,
  beforeColumnId: string | null
) {
  await requireEditor();
  if (columnId === beforeColumnId) return;
  const existing = await db.column.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const ids = existing.map((c) => c.id).filter((id) => id !== columnId);
  const at = beforeColumnId ? ids.indexOf(beforeColumnId) : ids.length;
  ids.splice(at === -1 ? ids.length : at, 0, columnId);
  for (let i = 0; i < ids.length; i++) {
    await db.column.update({ where: { id: ids[i] }, data: { position: i } });
  }
  touch(boardId);
}

export async function setColumnLabels(
  boardId: string,
  columnId: string,
  labels: { id: string; label: string; color: string }[]
) {
  await requireEditor();
  await patchColumnConfig(columnId, { labels });
  touch(boardId);
}

// Create a new status label on the fly (from a status cell) and, when an item
// is given, assign it to that cell in one step. Reuses an existing label when
// the text matches (case-insensitive) so we don't create duplicates.
export async function addStatusLabel(
  boardId: string,
  columnId: string,
  itemId: string | null,
  label: string,
  color?: string
) {
  await requireEditor();
  const trimmed = label.trim();
  if (!trimmed) return;

  const column = await db.column.findUnique({ where: { id: columnId } });
  if (!column || column.type !== "status") return;

  let cfg: { labels?: StatusLabel[] } = {};
  try {
    cfg = JSON.parse(column.config || "{}");
  } catch {
    cfg = {};
  }
  const labels = cfg.labels ?? [];

  const existing = labels.find(
    (l) => l.label.trim().toLowerCase() === trimmed.toLowerCase()
  );
  let labelId: string;
  if (existing) {
    labelId = existing.id;
  } else {
    labelId = `l${Math.random().toString(36).slice(2, 8)}`;
    const newColor = color || PALETTE[labels.length % PALETTE.length];
    labels.push({ id: labelId, label: trimmed, color: newColor });
    await db.column.update({
      where: { id: columnId },
      data: { config: JSON.stringify({ ...cfg, labels }) },
    });
  }

  if (itemId) {
    await db.cell.upsert({
      where: { itemId_columnId: { itemId, columnId } },
      create: { itemId, columnId, value: labelId },
      update: { value: labelId },
    });
    await runAutomations({
      type: "status_changes",
      boardId,
      itemId,
      columnId,
      value: labelId,
    });
  }
  touch(boardId);
}

// ── Boards ───────────────────────────────────────────────────
export async function renameBoard(boardId: string, name: string) {
  await requireEditor();
  await db.board.update({ where: { id: boardId }, data: { name: name.trim() } });
  touch(boardId);
  revalidatePath("/", "layout");
}

// Soft-delete → moves to Archive/Trash (restorable).
export async function archiveBoard(boardId: string) {
  await requireEditor();
  await db.board.update({ where: { id: boardId }, data: { archivedAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function restoreBoard(boardId: string) {
  await requireEditor();
  await db.board.update({ where: { id: boardId }, data: { archivedAt: null } });
  revalidatePath("/", "layout");
}

// Permanent delete (from Archive/Trash) — irreversible, cascades to all board data.
export async function deleteBoard(boardId: string) {
  await requireEditor();
  await db.board.delete({ where: { id: boardId } });
  revalidatePath("/", "layout");
}

// Sort a workspace's boards alphabetically (A–Z) by rewriting their positions.
export async function sortBoards(environmentId: string) {
  await requireEditor();
  const boards = await db.board.findMany({
    where: { environmentId },
    select: { id: true, name: true },
  });
  boards.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  for (let i = 0; i < boards.length; i++) {
    await db.board.update({ where: { id: boards[i].id }, data: { position: i } });
  }
  revalidatePath("/", "layout");
}

export async function addBoard(environmentId: string, name: string) {
  const user = await requireEditor();
  const count = await db.board.count({ where: { environmentId } });
  const board = await db.board.create({
    data: {
      environmentId,
      name: name.trim() || "New Board",
      position: count,
      groups: {
        create: [
          { name: "New Group", color: "#2D6CDF", position: 0 },
          { name: "Done", color: "#2E9C63", position: 1 },
        ],
      },
      columns: {
        create: [
          {
            name: "Status",
            type: "status",
            position: 0,
            config: JSON.stringify({ labels: DEFAULT_STATUS_LABELS }),
          },
          { name: "Owner", type: "person", position: 1 },
          { name: "Date", type: "date", position: 2 },
        ],
      },
    },
  });
  void user;
  revalidatePath("/", "layout");
  return board.id;
}
