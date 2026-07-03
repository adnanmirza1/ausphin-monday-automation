import "server-only";
import { db } from "@/lib/db";

// Environments + their boards for the sidebar nav.
export async function getNav(orgId: string) {
  return db.environment.findMany({
    where: { orgId },
    orderBy: { position: "asc" },
    include: {
      boards: {
        orderBy: { position: "asc" },
        select: { id: true, name: true },
      },
    },
  });
}

// Full board with groups, columns, and items (+cells) for the board view.
export async function getBoard(boardId: string) {
  return db.board.findUnique({
    where: { id: boardId },
    include: {
      environment: true,
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
