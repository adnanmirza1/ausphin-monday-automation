import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { permsOf, allowedBoardIds } from "@/lib/guard";
import { getNav } from "@/lib/queries";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const navAll = await getNav(user.orgId);
  const allowed = allowedBoardIds(user);
  const nav = allowed
    ? navAll.map((e) => ({ ...e, boards: e.boards.filter((b) => allowed.includes(b.id)) }))
    : navAll;
  const p = permsOf(user);

  return (
    <AppShell
      nav={nav}
      user={{
        name: user.name,
        email: user.email,
        avatarColor: user.avatarColor,
        role: user.role?.name ?? "—",
        canManageUsers: !!(p.canManageUsers || p.canManageEnvironments),
        canManageBoards: !!(p.canManageBoards || p.canEditItems),
        canManageEnvironments: !!(p.canManageUsers || p.canManageEnvironments),
      }}
    >
      {children}
    </AppShell>
  );
}
