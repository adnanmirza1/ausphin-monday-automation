import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { permsOf } from "@/lib/guard";
import { getArchive } from "@/lib/queries";
import { TrashPanel } from "@/components/trash-panel";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const p = permsOf(user);
  if (!p.canManageUsers && !p.canManageEnvironments) redirect("/");

  const { environments, boards } = await getArchive(user.orgId);

  return (
    <TrashPanel
      environments={environments.map((e) => ({
        id: e.id,
        name: e.name,
        color: e.color,
        archivedAt: e.archivedAt!.toISOString(),
      }))}
      boards={boards.map((b) => ({
        id: b.id,
        name: b.name,
        archivedAt: b.archivedAt!.toISOString(),
        environment: { id: b.environment.id, name: b.environment.name },
      }))}
    />
  );
}
