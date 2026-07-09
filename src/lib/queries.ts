import "server-only";
import { db } from "@/lib/db";

// Environments + their boards for the sidebar nav. Archived items are hidden
// (they live in Archive/Trash until restored or permanently deleted).
export async function getNav(orgId: string) {
  return db.environment.findMany({
    where: { orgId, archivedAt: null },
    orderBy: { position: "asc" },
    include: {
      boards: {
        where: { archivedAt: null },
        orderBy: { position: "asc" },
        select: { id: true, name: true },
      },
    },
  });
}

// Archived environments + archived boards (of live environments) for the trash view.
export async function getArchive(orgId: string) {
  const [environments, boards] = await Promise.all([
    db.environment.findMany({
      where: { orgId, archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
      select: { id: true, name: true, color: true, archivedAt: true },
    }),
    db.board.findMany({
      where: { archivedAt: { not: null }, environment: { orgId } },
      orderBy: { archivedAt: "desc" },
      select: {
        id: true,
        name: true,
        archivedAt: true,
        environment: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { environments, boards };
}

// Full board with groups, columns, and items (+cells) for the board view.
export async function getBoard(boardId: string) {
  return db.board.findUnique({
    where: { id: boardId },
    include: {
      environment: true,
      forms: { orderBy: { position: "asc" } },
      columns: { orderBy: { position: "asc" } },
      groups: {
        orderBy: { position: "asc" },
        include: {
          items: {
            orderBy: { position: "asc" },
            include: {
              cells: { include: { person: true } },
            },
          },
        },
      },
    },
  });
}

export type BoardWithData = NonNullable<Awaited<ReturnType<typeof getBoard>>>;

// People in the org (for person-column pickers).
export async function getOrgPeople(orgId: string) {
  return db.user.findMany({
    where: { orgId, status: { not: "inactive" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, avatarColor: true },
  });
}
