import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { permsOf } from "@/lib/guard";
import { db } from "@/lib/db";
import { AdminPanel } from "@/components/admin/admin-panel";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const p = permsOf(user);
  if (!p.canManageUsers && !p.canManageEnvironments) redirect("/");

  const orgId = user.orgId;
  const boards = await db.board.findMany({
    where: { environment: { orgId } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const [users, roles, departments, invitations] = await Promise.all([
    db.user.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
      include: { role: true, department: true },
    }),
    db.role.findMany({ where: { orgId }, orderBy: { rank: "asc" } }),
    db.department.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
    db.invitation.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <AdminPanel
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarColor: u.avatarColor,
        avatarUrl: u.avatarUrl,
        status: u.status,
        roleId: u.roleId,
        departmentId: u.departmentId,
      }))}
      boards={boards}
      currentUserId={user.id}
      roles={roles.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        isSystem: r.isSystem,
        readOnly: safeReadOnly(r.permissions),
        boards: safeBoards(r.permissions),
      }))}
      departments={departments.map((d) => ({ id: d.id, name: d.name, color: d.color }))}
      invitations={invitations.map((i) => ({
        id: i.id,
        email: i.email,
        status: i.status,
        roleId: i.roleId,
        token: i.token,
      }))}
    />
  );
}

function safeReadOnly(permissions: string) {
  try {
    return !!JSON.parse(permissions).readOnly;
  } catch {
    return false;
  }
}

function safeBoards(permissions: string): "all" | string[] {
  try {
    const b = JSON.parse(permissions).boards;
    return Array.isArray(b) ? b : "all";
  } catch {
    return "all";
  }
}
