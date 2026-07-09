import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { allowedBoardIds } from "@/lib/guard";
import { db } from "@/lib/db";
import { getBoard, getOrgPeople } from "@/lib/queries";
import type { BoardData, ColumnData } from "@/lib/board-types";
import type { ColumnType, StatusLabel } from "@/lib/constants";
import { BoardView } from "@/components/board/board-view";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { boardId } = await params;
  const board = await getBoard(boardId);
  if (!board || board.environment.orgId !== user.orgId) notFound();

  // Per-role board access enforcement.
  const allowed = allowedBoardIds(user);
  if (allowed && !allowed.includes(boardId)) notFound();

  const people = await getOrgPeople(user.orgId);
  const departments = await db.department.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const templates = await db.docTemplate.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, body: true },
  });
  const employers = await db.employer.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const viewRows = await db.boardView.findMany({
    where: { boardId: board.id },
    orderBy: { position: "asc" },
  });
  const views = viewRows.map((v) => {
    let config = { hiddenColumns: [] as string[], filters: [] as { columnId: string; value: string }[] };
    try {
      const parsed = JSON.parse(v.config);
      config = {
        hiddenColumns: parsed.hiddenColumns ?? [],
        filters: parsed.filters ?? [],
      };
    } catch {}
    return { id: v.id, name: v.name, isPinned: v.isPinned, config };
  });

  // Parse column configs (status labels + connection/mirror wiring).
  const cfgOf = (raw: string) => {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const columns: ColumnData[] = board.columns.map((c) => {
    const cfg = cfgOf(c.config);
    return {
      id: c.id,
      name: c.name,
      type: c.type as ColumnType,
      labels: c.type === "status" ? ((cfg.labels as StatusLabel[]) ?? []) : [],
      description: (cfg.description as string) || undefined,
      required: (cfg.required as boolean) || undefined,
      defaultValue: (cfg.defaultValue as string) || undefined,
      targetBoardId: (cfg.targetBoardId as string) ?? undefined,
      connectionColumnId: (cfg.connectionColumnId as string) ?? undefined,
      sourceColumnId: (cfg.sourceColumnId as string) ?? undefined,
    };
  });
  const colById = new Map(board.columns.map((c) => [c.id, c]));

  // Collect linked item ids from connection cells, then fetch those items
  // (with their board's columns) to resolve names + mirrored values.
  const linkedIds = new Set<string>();
  for (const g of board.groups)
    for (const it of g.items)
      for (const cell of it.cells)
        if (colById.get(cell.columnId)?.type === "connection" && cell.value)
          linkedIds.add(cell.value);

  const linkedItems = await db.item.findMany({
    where: { id: { in: [...linkedIds] } },
    include: { cells: { include: { person: true } }, board: { include: { columns: true } } },
  });
  const linkedMap = new Map(linkedItems.map((li) => [li.id, li]));

  function resolveSource(linkedItemId: string, sourceColumnId: string): string {
    const li = linkedMap.get(linkedItemId);
    if (!li) return "";
    const col = li.board.columns.find((c) => c.id === sourceColumnId);
    const cell = li.cells.find((c) => c.columnId === sourceColumnId);
    const v = cell?.value ?? "";
    if (!col) return v;
    if (col.type === "status") {
      try {
        const labels: StatusLabel[] = JSON.parse(col.config).labels ?? [];
        return labels.find((l) => l.id === v)?.label ?? "";
      } catch {
        return "";
      }
    }
    if (col.type === "person") return cell?.person?.name ?? "";
    return v;
  }

  // Options for connection pickers + boards/columns for the add-column UI.
  const connectionCols = board.columns.filter((c) => c.type === "connection");
  const connectionOptions: Record<string, { id: string; name: string }[]> = {};
  for (const c of connectionCols) {
    const tb = (cfgOf(c.config).targetBoardId as string) ?? "";
    if (tb) {
      connectionOptions[c.id] = await db.item.findMany({
        where: { boardId: tb },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    }
  }
  const orgBoards = await db.board.findMany({
    where: {
      environment: { orgId: user.orgId },
      ...(allowed ? { id: { in: allowed } } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      columns: { select: { id: true, name: true, type: true }, orderBy: { position: "asc" } },
    },
  });
  const allBoards = orgBoards.map((b) => ({ id: b.id, name: b.name }));
  const boardColumnsMap: Record<string, { id: string; name: string; type: string }[]> =
    Object.fromEntries(orgBoards.map((b) => [b.id, b.columns]));

  let formCfg: {
    columns?: string[];
    dedupeColumnId?: string | null;
    groupId?: string | null;
    welcomeMessage?: string;
  } = {};
  try {
    formCfg = JSON.parse(board.formConfig);
  } catch {}

  const data: BoardData = {
    id: board.id,
    name: board.name,
    description: board.description,
    environmentName: board.environment.name,
    form: {
      enabled: board.formEnabled,
      title: board.formTitle,
      desc: board.formDesc,
      columns: formCfg.columns ?? [],
      dedupeColumnId: formCfg.dedupeColumnId ?? null,
      groupId: formCfg.groupId ?? null,
      welcomeMessage: formCfg.welcomeMessage ?? "",
    },
    columns,
    groups: board.groups.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      items: g.items.map((it) => {
        const cells: BoardData["groups"][number]["items"][number]["cells"] = {};
        for (const cell of it.cells) {
          const col = colById.get(cell.columnId);
          cells[cell.columnId] = {
            value: cell.value,
            personId: cell.personId,
            person: cell.person
              ? {
                  id: cell.person.id,
                  name: cell.person.name,
                  email: cell.person.email,
                  avatarColor: cell.person.avatarColor,
                }
              : null,
            display:
              col?.type === "connection" && cell.value
                ? linkedMap.get(cell.value)?.name ?? ""
                : undefined,
          };
        }
        // Inject synthetic cells for mirror columns (resolved via connection).
        for (const mc of columns.filter((c) => c.type === "mirror")) {
          const connCell = mc.connectionColumnId ? cells[mc.connectionColumnId] : undefined;
          const linkedId = connCell?.value ?? null;
          const display =
            linkedId && mc.sourceColumnId ? resolveSource(linkedId, mc.sourceColumnId) : "";
          cells[mc.id] = { value: null, personId: null, person: null, display };
        }
        return { id: it.id, name: it.name, cells };
      }),
    })),
  };

  const readOnly = safeReadOnly(user.role?.permissions);

  return (
    <BoardView
      board={data}
      people={people}
      departments={departments}
      templates={templates}
      employers={employers}
      views={views}
      connectionOptions={connectionOptions}
      allBoards={allBoards}
      boardColumnsMap={boardColumnsMap}
      readOnly={readOnly}
    />
  );
}

function safeReadOnly(permissions?: string) {
  try {
    return !!JSON.parse(permissions ?? "{}").readOnly;
  } catch {
    return false;
  }
}
