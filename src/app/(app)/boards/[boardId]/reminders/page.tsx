import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { upcomingReminders } from "@/lib/reminders";
import { RemindersPanel } from "@/components/reminders/reminders-panel";

export const dynamic = "force-dynamic";

export default async function RemindersPage({
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
      reminderRules: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!board || board.environment.orgId !== user.orgId) notFound();

  const [departments, upcoming] = await Promise.all([
    db.department.findMany({
      where: { orgId: user.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    upcomingReminders(board.id),
  ]);

  const dateColumns = board.columns
    .filter((c) => c.type === "date")
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <RemindersPanel
      boardId={board.id}
      boardName={board.name}
      environmentName={board.environment.name}
      dateColumns={dateColumns}
      departments={departments}
      rules={board.reminderRules.map((r) => ({
        id: r.id,
        name: r.name,
        dateColumnId: r.dateColumnId,
        offsets: safeOffsets(r.offsets),
        notifyDepartmentId: r.notifyDepartmentId,
        enabled: r.enabled,
      }))}
      upcoming={upcoming}
    />
  );
}

function safeOffsets(raw: string): number[] {
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
