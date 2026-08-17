"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBoardEditor, requireBoardAccessAsUser, requireEnvironmentEditor, canEditColumn } from "@/lib/guard";
import {
  DEFAULT_STATUS_LABELS,
  PALETTE,
  type ColumnType,
  type StatusLabel,
} from "@/lib/constants";
import { runAutomations } from "@/lib/automation";
import { resolveOrCreateItem, type CellSeed } from "@/lib/subitems";

function touch(boardId: string) {
  revalidatePath(`/boards/${boardId}`);
}

// Merge a patch into a column's JSON config, dropping keys set to undefined.
// boardId-scoped: the caller has already authorized boardId via
// requireBoardEditor, so the read+write here must both be constrained to a
// column that actually belongs to that board — never trust columnId alone.
async function patchColumnConfig(
  boardId: string,
  columnId: string,
  patch: Record<string, unknown>
) {
  const col = await db.column.findFirst({ where: { id: columnId, boardId } });
  if (!col) throw new Error("Column not found on this board.");
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(col.config || "{}");
  } catch {
    cfg = {};
  }
  const next = { ...cfg, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  await db.column.updateMany({
    where: { id: columnId, boardId },
    data: { config: JSON.stringify(next) },
  });
}

// ── Items ────────────────────────────────────────────────────
export async function addItem(boardId: string, groupId: string, name: string) {
  await requireBoardEditor(boardId);
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
  await requireBoardEditor(boardId);
  // Scoped by boardId too: an editor authorized on THIS board must not be
  // able to rename an itemId that actually belongs to a different board.
  await db.item.updateMany({ where: { id: itemId, boardId }, data: { name: name.trim() } });
  touch(boardId);
}

export async function deleteItem(boardId: string, itemId: string) {
  await requireBoardEditor(boardId);
  await db.item.deleteMany({ where: { id: itemId, boardId } });
  touch(boardId);
}

// ── Subitems (Feature 1) ────────────────────────────────────
// Explicit "add subitem" from the item panel — lets a user deliberately
// nest a record under a parent, independent of email auto-matching.
export async function addSubitem(boardId: string, parentId: string, name: string) {
  await requireBoardEditor(boardId);
  const trimmed = name.trim();
  if (!trimmed) return;
  const parent = await db.item.findUnique({ where: { id: parentId }, select: { boardId: true, groupId: true } });
  if (!parent || parent.boardId !== boardId) throw new Error("Parent item not found on this board.");
  const count = await db.item.count({ where: { groupId: parent.groupId } });
  const subitem = await db.item.create({
    data: { boardId, groupId: parent.groupId, name: trimmed, position: count, parentId },
  });
  await runAutomations({ type: "item_created", boardId, itemId: subitem.id });
  touch(boardId);
}

// Detach a subitem back into a normal main item (keeps its data/cells; it
// just stops being nested under its parent).
export async function promoteSubitem(boardId: string, itemId: string) {
  await requireBoardEditor(boardId);
  await db.item.updateMany({ where: { id: itemId, boardId }, data: { parentId: null } });
  touch(boardId);
}

// Drag-reorder subitems WITHIN their shared parent only (subitems never
// change group or move to a different parent via drag — matches
// monday.com). `subitemId` is placed before `beforeSubitemId` (or at the
// end when null); positions of every sibling under `parentId` are
// reindexed. Both ids are re-verified to belong to boardId/parentId rather
// than trusted from the client.
export async function reorderSubitem(
  boardId: string,
  parentId: string,
  subitemId: string,
  beforeSubitemId: string | null
) {
  await requireBoardEditor(boardId);
  if (subitemId === beforeSubitemId) return;

  const parent = await db.item.findFirst({ where: { id: parentId, boardId }, select: { id: true } });
  if (!parent) throw new Error("Parent item not found on this board.");
  const moved = await db.item.findFirst({ where: { id: subitemId, boardId, parentId }, select: { id: true } });
  if (!moved) throw new Error("Subitem not found under this parent.");

  const existing = await db.item.findMany({
    where: { parentId, boardId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const ids = existing.map((i) => i.id).filter((id) => id !== subitemId);
  const at = beforeSubitemId ? ids.indexOf(beforeSubitemId) : ids.length;
  ids.splice(at === -1 ? ids.length : at, 0, subitemId);

  for (let i = 0; i < ids.length; i++) {
    await db.item.update({ where: { id: ids[i] }, data: { position: i } });
  }
  touch(boardId);
}

export type SubitemRow = { id: string; name: string };

// Subitems of an item, for the item panel drawer (read access only). Scoped
// through the parent item's board so a caller can't enumerate subitems of
// an item on a board they don't have access to.
export async function getItemSubitems(itemId: string): Promise<SubitemRow[]> {
  const parent = await db.item.findUnique({ where: { id: itemId }, select: { boardId: true } });
  if (!parent) return [];
  await requireBoardAccessAsUser(parent.boardId);
  const rows = await db.item.findMany({
    where: { parentId: itemId },
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });
  return rows;
}

export type ParentItemRow = { id: string; name: string; boardId: string } | null;

// If this item is itself a subitem, its parent — for the item panel drawer
// to show "Subitem of X" with a link back.
export async function getItemParent(itemId: string): Promise<ParentItemRow> {
  const item = await db.item.findUnique({ where: { id: itemId }, select: { boardId: true, parent: { select: { id: true, name: true, boardId: true } } } });
  if (!item) return null;
  await requireBoardAccessAsUser(item.boardId);
  return item.parent ?? null;
}

export async function moveItemToGroup(
  boardId: string,
  itemId: string,
  groupId: string
) {
  await requireBoardEditor(boardId);
  // groupId must belong to this same board — otherwise an item could be
  // moved into another board's group by crafting the request.
  const targetGroup = await db.group.findFirst({ where: { id: groupId, boardId }, select: { id: true } });
  if (!targetGroup) throw new Error("Group not found on this board.");
  const count = await db.item.count({ where: { groupId } });
  await db.item.updateMany({
    where: { id: itemId, boardId },
    data: { groupId, position: count },
  });
  await runAutomations({ type: "item_moved", boardId, itemId, groupId });
  touch(boardId);
}

// Import rows (from a CSV) into a group. `mapping[i]` says where CSV column i
// goes: "__name__" (item name), a columnId, or "" to skip.
// Rows whose mapped email matches an existing main item on the board become
// subitems under that item instead of duplicate main items (Feature 1).
export async function importItems(
  boardId: string,
  groupId: string,
  header: string[],
  rows: string[][],
  mapping: string[]
) {
  await requireBoardEditor(boardId);
  const targetGroup = await db.group.findFirst({ where: { id: groupId, boardId }, select: { id: true } });
  if (!targetGroup) throw new Error("Group not found on this board.");
  const nameIdx = mapping.findIndex((m) => m === "__name__");
  let created = 0;
  let createdAsSubitems = 0;
  for (const row of rows) {
    const name = (nameIdx >= 0 ? row[nameIdx] : row[0])?.trim() || "Untitled";
    const cells: CellSeed[] = [];
    for (let i = 0; i < mapping.length; i++) {
      const target = mapping[i];
      if (!target || target === "__name__") continue;
      const value = (row[i] ?? "").trim();
      if (!value) continue;
      cells.push({ columnId: target, value });
    }
    const result = await resolveOrCreateItem(boardId, groupId, name, cells);
    if (result.createdAsSubitem) createdAsSubitems++;
    // Automations must never block the import — log and continue on error,
    // matching the public-form submission path (see form.ts).
    try {
      await runAutomations({ type: "item_created", boardId, itemId: result.id });
    } catch (e) {
      console.error("[import:automation-error]", e);
    }
    created++;
  }
  void header;
  touch(boardId);
  return { created, createdAsSubitems };
}

// Bulk actions on many selected items at once (Part: bulk selection).
export async function bulkDeleteItems(boardId: string, itemIds: string[]) {
  await requireBoardEditor(boardId);
  if (itemIds.length === 0) return;
  await db.item.deleteMany({ where: { id: { in: itemIds }, boardId } });
  touch(boardId);
}

export async function bulkMoveItems(
  boardId: string,
  itemIds: string[],
  groupId: string
) {
  await requireBoardEditor(boardId);
  if (itemIds.length === 0) return;
  const targetGroup = await db.group.findFirst({ where: { id: groupId, boardId }, select: { id: true } });
  if (!targetGroup) throw new Error("Group not found on this board.");
  // Only fire the "item moved to group" trigger for items whose group actually
  // changes — matches the single-item move path so bulk moves run automations.
  const before = await db.item.findMany({
    where: { id: { in: itemIds }, boardId },
    select: { id: true, groupId: true },
  });
  const changed = new Set(before.filter((i) => i.groupId !== groupId).map((i) => i.id));
  let count = await db.item.count({ where: { groupId } });
  for (const it of before) {
    await db.item.update({ where: { id: it.id }, data: { groupId, position: count++ } });
  }
  for (const id of changed) {
    await runAutomations({ type: "item_moved", boardId, itemId: id, groupId });
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
  await requireBoardEditor(boardId);
  if (itemId === beforeItemId) return;

  const targetGroup = await db.group.findFirst({ where: { id: targetGroupId, boardId }, select: { id: true } });
  if (!targetGroup) throw new Error("Group not found on this board.");
  const moved = await db.item.findFirst({ where: { id: itemId, boardId }, select: { groupId: true } });
  if (!moved) throw new Error("Item not found on this board.");

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
  if (moved.groupId !== targetGroupId)
    await runAutomations({ type: "item_moved", boardId, itemId, groupId: targetGroupId });
  touch(boardId);
}

// ── Cells ────────────────────────────────────────────────────
export async function setCell(
  boardId: string,
  itemId: string,
  columnId: string,
  value: string | null
) {
  const user = await requireBoardEditor(boardId);
  const column = await db.column.findFirst({ where: { id: columnId, boardId } });
  if (!column) throw new Error("Column not found on this board.");
  if (!canEditColumn(user, column.config))
    throw new Error("You don't have permission to edit this column.");
  const item = await db.item.findFirst({ where: { id: itemId, boardId }, select: { id: true } });
  if (!item) throw new Error("Item not found on this board.");
  await db.cell.upsert({
    where: { itemId_columnId: { itemId, columnId } },
    create: { itemId, columnId, value },
    update: { value },
  });
  // Fire status-change automations when a status column changes.
  if (column.type === "status") {
    await runAutomations({ type: "status_changes", boardId, itemId, columnId, value });
  }
  // Generic column-changed trigger (any column).
  await runAutomations({ type: "column_changes", boardId, itemId, columnId, value });
  touch(boardId);
}

export async function setPersonCell(
  boardId: string,
  itemId: string,
  columnId: string,
  personId: string | null
) {
  const user = await requireBoardEditor(boardId);
  const column = await db.column.findFirst({ where: { id: columnId, boardId } });
  if (!column) throw new Error("Column not found on this board.");
  if (!canEditColumn(user, column.config))
    throw new Error("You don't have permission to edit this column.");
  const item = await db.item.findFirst({ where: { id: itemId, boardId }, select: { id: true } });
  if (!item) throw new Error("Item not found on this board.");
  await db.cell.upsert({
    where: { itemId_columnId: { itemId, columnId } },
    create: { itemId, columnId, personId, value: personId },
    update: { personId, value: personId },
  });
  await runAutomations({ type: "person_assigned", boardId, itemId, columnId, personId });
  touch(boardId);
}

// Set who may edit a column's cells (Improvement #1):
//   "all" | "admins" | { roles, departments, users }
export async function setColumnPermission(
  boardId: string,
  columnId: string,
  edit:
    | "all"
    | "admins"
    | { roles: string[]; departments: string[]; users: string[] }
) {
  await requireBoardEditor(boardId);
  let value: unknown;
  if (edit === "all") value = undefined;
  else if (edit === "admins") value = "admins";
  else {
    const clean = {
      roles: edit.roles ?? [],
      departments: edit.departments ?? [],
      users: edit.users ?? [],
    };
    const empty = !clean.roles.length && !clean.departments.length && !clean.users.length;
    value = empty ? undefined : clean;
  }
  await patchColumnConfig(boardId, columnId, { edit: value });
  touch(boardId);
}

// ── Groups ───────────────────────────────────────────────────
export async function addGroup(boardId: string, name: string) {
  await requireBoardEditor(boardId);
  const count = await db.group.count({ where: { boardId } });
  await db.group.create({
    data: { boardId, name: name.trim() || "New Group", position: count },
  });
  touch(boardId);
}

export async function renameGroup(boardId: string, groupId: string, name: string) {
  await requireBoardEditor(boardId);
  await db.group.updateMany({ where: { id: groupId, boardId }, data: { name: name.trim() } });
  touch(boardId);
}

export async function setGroupColor(
  boardId: string,
  groupId: string,
  color: string
) {
  await requireBoardEditor(boardId);
  await db.group.updateMany({ where: { id: groupId, boardId }, data: { color } });
  touch(boardId);
}

export async function deleteGroup(boardId: string, groupId: string) {
  await requireBoardEditor(boardId);
  await db.group.deleteMany({ where: { id: groupId, boardId } });
  touch(boardId);
}

// Drag-reorder groups: place groupId before beforeGroupId (null = end).
export async function reorderGroup(
  boardId: string,
  groupId: string,
  beforeGroupId: string | null
) {
  await requireBoardEditor(boardId);
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

// One-click reorder for the ▲▼ buttons — swap a group with its immediate
// neighbor instead of requiring drag-and-drop.
export async function moveGroup(boardId: string, groupId: string, direction: "up" | "down") {
  await requireBoardEditor(boardId);
  const groups = await db.group.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  const idx = groups.findIndex((g) => g.id === groupId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= groups.length) return;
  const a = groups[idx];
  const b = groups[swapIdx];
  await db.group.update({ where: { id: a.id }, data: { position: b.position } });
  await db.group.update({ where: { id: b.id }, data: { position: a.position } });
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
  await requireBoardEditor(boardId);
  const count = await db.column.count({ where: { boardId } });
  let config = "{}";
  if (type === "status") config = JSON.stringify({ labels: DEFAULT_STATUS_LABELS });
  else if (extraConfig) config = JSON.stringify(extraConfig);

  // Insert right after `afterColumnId` (shifting later columns), else append.
  let position = count;
  if (afterColumnId) {
    const after = await db.column.findFirst({ where: { id: afterColumnId, boardId } });
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
  await requireBoardEditor(boardId);
  const col = await db.column.findFirst({ where: { id: columnId, boardId } });
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
  await requireBoardEditor(boardId);
  await patchColumnConfig(boardId, columnId, { description: description.trim() || undefined });
  touch(boardId);
}

export async function setColumnRequired(
  boardId: string,
  columnId: string,
  required: boolean
) {
  await requireBoardEditor(boardId);
  await patchColumnConfig(boardId, columnId, { required: required || undefined });
  touch(boardId);
}

export async function setColumnDefault(
  boardId: string,
  columnId: string,
  value: string | null
) {
  await requireBoardEditor(boardId);
  await patchColumnConfig(boardId, columnId, { defaultValue: value || undefined });
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
  await requireBoardEditor(boardId);
  const col = await db.column.findFirst({ where: { id: columnId, boardId } });
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
  await requireBoardEditor(boardId);
  await db.column.updateMany({ where: { id: columnId, boardId }, data: { name: name.trim() } });
  touch(boardId);
}

export async function deleteColumn(boardId: string, columnId: string) {
  await requireBoardEditor(boardId);
  await db.column.deleteMany({ where: { id: columnId, boardId } });
  touch(boardId);
}

// Drag-reorder columns: place columnId before beforeColumnId (null = end).
export async function reorderColumn(
  boardId: string,
  columnId: string,
  beforeColumnId: string | null
) {
  await requireBoardEditor(boardId);
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
  await requireBoardEditor(boardId);
  await patchColumnConfig(boardId, columnId, { labels });
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
  await requireBoardEditor(boardId);
  const trimmed = label.trim();
  if (!trimmed) return;

  const column = await db.column.findFirst({ where: { id: columnId, boardId } });
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
    await db.column.updateMany({
      where: { id: columnId, boardId },
      data: { config: JSON.stringify({ ...cfg, labels }) },
    });
  }

  if (itemId) {
    const item = await db.item.findFirst({ where: { id: itemId, boardId }, select: { id: true } });
    if (!item) return;
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
  await requireBoardEditor(boardId);
  await db.board.update({ where: { id: boardId }, data: { name: name.trim() } });
  touch(boardId);
  revalidatePath("/", "layout");
}

// Rename the built-in Item column's DISPLAY label (Improvement 3) — e.g.
// "Candidate Name". Presentation only: item ids, cells, automations, and
// APIs are all keyed off Item.id/Cell.itemId, none of which this touches.
// An empty/whitespace-only name resets to the default "Item" label.
export async function setItemColumnName(boardId: string, name: string) {
  await requireBoardEditor(boardId);
  const trimmed = name.trim().slice(0, 60);
  await db.board.update({ where: { id: boardId }, data: { itemColumnName: trimmed } });
  touch(boardId);
}

// Soft-delete → moves to Archive/Trash (restorable).
export async function archiveBoard(boardId: string) {
  await requireBoardEditor(boardId);
  await db.board.update({ where: { id: boardId }, data: { archivedAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function restoreBoard(boardId: string) {
  await requireBoardEditor(boardId);
  await db.board.update({ where: { id: boardId }, data: { archivedAt: null } });
  revalidatePath("/", "layout");
}

// Permanent delete (from Archive/Trash) — irreversible, cascades to all board data.
export async function deleteBoard(boardId: string) {
  await requireBoardEditor(boardId);
  await db.board.delete({ where: { id: boardId } });
  revalidatePath("/", "layout");
}

// Sort a workspace's boards alphabetically (A–Z) by rewriting their positions.
// environmentId-scoped: requireEnvironmentEditor verifies the workspace
// belongs to the caller's org before any board in it is touched.
export async function sortBoards(environmentId: string) {
  await requireEnvironmentEditor(environmentId);
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
  const user = await requireEnvironmentEditor(environmentId);
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
