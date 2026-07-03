import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { permsOf } from "@/lib/guard";
import { db } from "@/lib/db";
import { EmployersPanel } from "@/components/employers/employers-panel";

export const dynamic = "force-dynamic";

export default async function EmployersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const p = permsOf(user);

  const employers = await db.employer.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: "asc" },
    include: {
      tags: {
        include: { item: { include: { board: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return (
    <EmployersPanel
      isAdmin={!!(p.canManageUsers || p.canManageEnvironments)}
      readOnly={!!p.readOnly}
      employers={employers.map((e) => ({
        id: e.id,
        name: e.name,
        contactEmail: e.contactEmail,
        contactPhone: e.contactPhone,
        candidates: e.tags.map((t) => ({
          tagId: t.id,
          itemId: t.itemId,
          name: t.item.name,
          board: t.item.board.name,
          boardId: t.item.boardId,
          stage: t.stage,
        })),
      }))}
    />
  );
}
