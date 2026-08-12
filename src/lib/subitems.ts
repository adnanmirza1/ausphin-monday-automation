import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// Subitems (Feature 1): group related records (endorsements, applications,
// activities) under a single main item instead of creating duplicate people,
// by matching on a board's email column. This module is the single source of
// truth for that matching + creation logic — reused by manual item creation
// (src/app/actions/board.ts) and the email-matching automations
// (src/lib/automation.ts).

type Db = Prisma.TransactionClient | typeof db;

// Case-insensitive, whitespace-safe email normalization used everywhere we
// compare emails for duplicate detection. Returns "" for empty/invalid input
// so callers can treat that as "no email to match on".
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

// The board's email-type column (used for duplicate/subitem matching). A
// board may have zero or more email columns; the first (by position) is
// used, matching how other automations already pick "the" email column.
export async function getEmailColumn(boardId: string, tx: Db = db) {
  return tx.column.findFirst({ where: { boardId, type: "email" }, orderBy: { position: "asc" } });
}

// Find the existing MAIN item (parentId == null) on a board whose email
// column value matches `email`, case-insensitively and whitespace-trimmed.
// Subitems are never matched against (a subitem cannot itself become a new
// parent) — only top-level items. When multiple main items share the same
// normalized email (pre-existing dirty data, or a race), the oldest one
// (by createdAt, tie-broken by id) is used deterministically so repeated
// calls converge on the same parent instead of scattering subitems.
export async function findMatchingParent(
  boardId: string,
  emailColumnId: string,
  email: string,
  tx: Db = db
): Promise<{ id: string; groupId: string; name: string } | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const candidates = await tx.item.findMany({
    where: {
      boardId,
      parentId: null,
      cells: { some: { columnId: emailColumnId, value: { not: null } } },
    },
    select: {
      id: true,
      groupId: true,
      name: true,
      createdAt: true,
      cells: { where: { columnId: emailColumnId }, select: { value: true } },
    },
  });

  const matches = candidates.filter((c) => normalizeEmail(c.cells[0]?.value) === normalized);
  if (matches.length === 0) return null;

  matches.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  return { id: matches[0].id, groupId: matches[0].groupId, name: matches[0].name };
}

export type CellSeed = { columnId: string; value: string | null; personId?: string | null };

async function writeCells(tx: Db, itemId: string, cells: CellSeed[]) {
  const rows = cells.filter((c) => c.value != null || c.personId != null);
  if (!rows.length) return;
  await tx.cell.createMany({
    data: rows.map((c) => ({
      itemId,
      columnId: c.columnId,
      value: c.value ?? null,
      personId: c.personId ?? null,
    })),
  });
}

// Create a subitem under `parentId`. Runs inside a transaction (when not
// already given one) so the existence check + create + cell writes are
// atomic.
export async function createSubitem(
  boardId: string,
  parentId: string,
  groupId: string,
  name: string,
  cells: CellSeed[] = [],
  tx: Db = db
): Promise<{ id: string }> {
  const run = async (client: Db) => {
    const parent = await client.item.findUnique({
      where: { id: parentId },
      select: { id: true, boardId: true },
    });
    if (!parent || parent.boardId !== boardId) {
      throw new Error("Parent item not found on this board.");
    }
    const count = await client.item.count({ where: { groupId } });
    const subitem = await client.item.create({
      data: { boardId, groupId, name: name.trim() || "Untitled", position: count, parentId },
    });
    await writeCells(client, subitem.id, cells);
    return { id: subitem.id };
  };
  // Already inside a caller-provided transaction — don't nest another.
  if (tx !== db) return run(tx);
  return db.$transaction((inner) => run(inner));
}

// The core "prevent duplicate people" decision (Requirements 5-9): given a
// board + candidate email + item name, either create a subitem under the
// matching main item, or a normal main item when there's no match (or no
// email column / no email configured on the board at all).
//
// Concurrency: the whole match-then-create sequence runs inside one
// transaction so that once a parent is found, its subitem is created
// atomically alongside the lookup. Two requests racing to create the
// "first" item for a brand-new email can still both miss the match (neither
// committed yet) and each create a main item — this mirrors the existing
// dedupe pattern in src/app/actions/form.ts and is an accepted limitation
// without a unique DB constraint on normalized email (the email column is
// user-defined/optional per board, so we can't enforce uniqueness at the
// schema level).
export async function resolveOrCreateItem(
  boardId: string,
  groupId: string,
  name: string,
  cells: CellSeed[] = []
): Promise<{ id: string; createdAsSubitem: boolean; parentId: string | null }> {
  return db.$transaction(async (tx) => {
    const emailColumn = await getEmailColumn(boardId, tx);
    const emailCell = emailColumn ? cells.find((c) => c.columnId === emailColumn.id) : undefined;
    const email = normalizeEmail(emailCell?.value);

    if (emailColumn && email) {
      const parent = await findMatchingParent(boardId, emailColumn.id, email, tx);
      if (parent) {
        const sub = await createSubitem(boardId, parent.id, parent.groupId, name, cells, tx);
        return { id: sub.id, createdAsSubitem: true, parentId: parent.id };
      }
    }

    const count = await tx.item.count({ where: { groupId } });
    const item = await tx.item.create({
      data: { boardId, groupId, name: name.trim() || "Untitled", position: count },
    });
    await writeCells(tx, item.id, cells);
    return { id: item.id, createdAsSubitem: false, parentId: null };
  });
}
