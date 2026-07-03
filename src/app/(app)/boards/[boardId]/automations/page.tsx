import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
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
      automations: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!board || board.environment.orgId !== user.orgId) notFound();

  const departments = await db.department.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const templates = await db.docTemplate.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

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
      environmentName={board.environment.name}
      columns={columns}
      groups={board.groups.map((g) => ({ id: g.id, name: g.name, color: g.color }))}
      departments={departments}
      templates={templates}
      automations={board.automations.map((a) => ({
        id: a.id,
        name: a.name,
        folder: a.folder,
        enabled: a.enabled,
        trigger: a.trigger,
        action: a.action,
      }))}
    />
  );
}
