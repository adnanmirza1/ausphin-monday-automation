import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { allowedBoardIds } from "@/lib/guard";
import type { StatusLabel } from "@/lib/constants";
import { AutomationsPanel } from "@/components/automation/automations-panel";

export default async function AutomationsPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { boardId } = await params;

  const board = await db.board.findUnique({
    where: { id: boardId },
    include: {
      environment: true,
      columns: { orderBy: { position: "asc" } },
      groups: { orderBy: { position: "asc" } },
      automations: { orderBy: [{ folder: "asc" }, { position: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!board || board.environment.orgId !== user.orgId) notFound();

  // Per-role board access enforcement — matches the board page's check
  // (src/app/(app)/boards/[boardId]/page.tsx), previously missing here.
  const allowed = allowedBoardIds(user);
  if (allowed && !allowed.includes(boardId)) notFound();

  const departments = await db.department.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const templates = await db.docTemplate.findMany({
    where: { boardId: board.id },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, reference: true, viewName: true, employer: true, active: true },
  });
  // Destination-board picker for "create item/subitem on another board"
  // actions (Automations 1 & 3) — restricted to boards this user may access,
  // with full column lists so the field-mapping UI can be built dynamically
  // (never hardcoded), mirroring boardColumnsMap in boards/[boardId]/page.tsx.
  const boardsRaw = await db.board.findMany({
    where: {
      environment: { orgId: user.orgId },
      archivedAt: null,
      ...(allowed ? { id: { in: allowed } } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      columns: { select: { id: true, name: true, type: true }, orderBy: { position: "asc" } },
    },
  });
  const boards = boardsRaw.map((b) => ({ id: b.id, name: b.name }));
  const boardColumnsMap: Record<string, { id: string; name: string; type: string }[]> = Object.fromEntries(
    boardsRaw.map((b) => [b.id, b.columns])
  );

  const columns = board.columns.map((c) => {
    let labels: StatusLabel[] = [];
    if (c.type === "status") {
      try {
        labels = JSON.parse(c.config).labels ?? [];
      } catch {}
    }
    return { id: c.id, name: c.name, type: c.type, labels };
  });

  return (
    <AutomationsPanel
      boardId={board.id}
      boardName={board.name}
      itemColumnName={board.itemColumnName || "Item"}
      environmentName={board.environment.name}
      columns={columns}
      groups={board.groups.map((g) => ({ id: g.id, name: g.name, color: g.color }))}
      departments={departments}
      templates={templates}
      boards={boards}
      boardColumnsMap={boardColumnsMap}
      automations={board.automations.map((a) => ({
        id: a.id,
        name: a.name,
        folder: a.folder,
        position: a.position,
        enabled: a.enabled,
        trigger: a.trigger,
        action: a.action,
      }))}
    />
  );
}
