"use server";

import { db } from "@/lib/db";
import { requireUser, allowedBoardIds } from "@/lib/guard";
import { urlDisplay, parseFileValue } from "@/lib/cell-values";
import type { StatusLabel } from "@/lib/constants";

// Normalized rows for the dashboard chart builder. Each row is keyed by column
// NAME so data from multiple boards can be combined (monday-style). Each row
// carries its source boardId so per-board filters can be applied. Numeric
// values are exposed separately for sum/average aggregation.
export type DashRow = { boardId: string; text: Record<string, string>; num: Record<string, number> };
export type DashColumn = { name: string; type: string };
export type DashBoardMeta = { id: string; name: string; columns: DashColumn[] };
export type DashPerson = { color: string; avatarUrl?: string; initials: string };
export type DashData = {
  boards: DashBoardMeta[];
  columns: DashColumn[];
  rows: DashRow[];
  people: Record<string, DashPerson>; // person display name -> avatar info
};

export async function getDashboardRows(boardIds: string[]): Promise<DashData> {
  const user = await requireUser();
  const allowed = allowedBoardIds(user);
  const ids = [...new Set(boardIds)].filter((id) => !allowed || allowed.includes(id));
  if (ids.length === 0) return { boards: [], columns: [], rows: [], people: {} };

  const boards = await db.board.findMany({
    where: { id: { in: ids }, environment: { orgId: user.orgId } },
    include: {
      columns: { orderBy: { position: "asc" } },
      groups: { select: { id: true, name: true } },
      items: { include: { cells: { include: { person: true } } } },
    },
  });

  const colTypes = new Map<string, string>(); // union column name -> type
  const boardsMeta: DashBoardMeta[] = [];
  const rows: DashRow[] = [];
  const people: Record<string, DashPerson> = {}; // person name -> avatar info
  const initialsOf = (n: string) => n.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  // Pseudo-columns always available for grouping/filtering.
  const PSEUDO: DashColumn[] = [
    { name: "Board", type: "text" },
    { name: "Group", type: "text" },
    { name: "Created month", type: "date" },
  ];
  for (const p of PSEUDO) colTypes.set(p.name, p.type);

  for (const b of boards) {
    const byId = new Map(b.columns.map((c) => [c.id, c]));
    const groupName = new Map(b.groups.map((g) => [g.id, g.name]));
    const perBoardCols: DashColumn[] = [...PSEUDO];
    for (const c of b.columns) {
      if (!colTypes.has(c.name)) colTypes.set(c.name, c.type);
      perBoardCols.push({ name: c.name, type: c.type });
    }
    boardsMeta.push({ id: b.id, name: b.name, columns: perBoardCols });

    for (const it of b.items) {
      const text: Record<string, string> = {
        Board: b.name,
        Group: groupName.get(it.groupId) ?? "",
        Name: it.name,
      };
      const num: Record<string, number> = {};
      for (const cell of it.cells) {
        const col = byId.get(cell.columnId);
        if (!col) continue;
        let v = cell.value ?? "";
        if (col.type === "status") {
          try {
            const labels: StatusLabel[] = JSON.parse(col.config).labels ?? [];
            v = labels.find((l) => l.id === cell.value)?.label ?? "";
          } catch {
            v = "";
          }
        } else if (col.type === "person") {
          v = cell.person?.name ?? "";
          if (cell.person && !people[v]) {
            people[v] = {
              color: cell.person.avatarColor,
              avatarUrl: cell.person.avatarUrl ?? undefined,
              initials: initialsOf(cell.person.name),
            };
          }
        } else if (col.type === "url") {
          v = urlDisplay(cell.value);
        } else if (col.type === "file") {
          v = parseFileValue(cell.value).map((f) => f.name).join(", ");
        }
        text[col.name] = v;
        if (col.type === "number") {
          const n = Number((cell.value ?? "").replace(/[^0-9.-]/g, ""));
          if (!isNaN(n)) num[col.name] = n;
        }
      }
      const d = it.createdAt;
      text["Created month"] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      rows.push({ boardId: b.id, text, num });
    }
  }

  const columns: DashColumn[] = [
    { name: "Name", type: "text" },
    ...[...colTypes].map(([name, type]) => ({ name, type })),
  ];
  return { boards: boardsMeta, columns, rows, people };
}
