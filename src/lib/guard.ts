import "server-only";
import { db } from "@/lib/db";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import type { Permissions } from "@/lib/constants";

export function permsOf(user: CurrentUser): Permissions {
  try {
    return JSON.parse(user.role?.permissions ?? "{}");
  } catch {
    return { boards: [] };
  }
}

// Board IDs this user may access, or null when unrestricted ("all").
export function allowedBoardIds(user: CurrentUser): string[] | null {
  const p = permsOf(user);
  if (p.boards === "all" || !Array.isArray(p.boards)) return null;
  return p.boards;
}

// Can this user edit cell values in a column with the given JSON config?
// config.edit: "all" (default) | "admins" | roleIds[]. Admins always may.
export function canEditColumn(user: CurrentUser, config: string): boolean {
  const p = permsOf(user);
  const isAdmin = !!(p.canManageUsers || p.canManageEnvironments || p.canManageBoards);
  let edit: unknown;
  try {
    edit = JSON.parse(config)?.edit;
  } catch {
    return true;
  }
  if (edit === undefined || edit === null || edit === "all") return true;
  if (edit === "admins") return isAdmin;
  if (isAdmin) return true;
  // Legacy shape: a plain array of role ids.
  if (Array.isArray(edit)) return user.roleId != null && edit.includes(user.roleId);
  // Custom shape: match on role, department, or explicit user (Improvement #1).
  if (typeof edit === "object") {
    const e = edit as { roles?: string[]; departments?: string[]; users?: string[] };
    const roles = Array.isArray(e.roles) ? e.roles : [];
    const departments = Array.isArray(e.departments) ? e.departments : [];
    const users = Array.isArray(e.users) ? e.users : [];
    return (
      (user.roleId != null && roles.includes(user.roleId)) ||
      (user.departmentId != null && departments.includes(user.departmentId)) ||
      users.includes(user.id)
    );
  }
  return true;
}

// Throws if not signed in.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  return user;
}

// Throws if the user cannot edit content (viewers are read-only).
export async function requireEditor(): Promise<CurrentUser> {
  const user = await requireUser();
  const p = permsOf(user);
  if (p.readOnly) throw new Error("Your role is read-only.");
  return user;
}

// Throws if the user cannot administer the org.
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  const p = permsOf(user);
  if (!p.canManageUsers && !p.canManageEnvironments)
    throw new Error("Admin access required.");
  return user;
}

// Throws if the user cannot edit content (like requireEditor) OR the given
// board isn't one they may access — org-scoped AND per-role board-restricted.
// A client can never be trusted to only ever send boardIds the caller is
// actually allowed to touch, so every board-scoped server action that
// accepts a boardId argument should call this instead of requireEditor()
// alone.
export async function requireBoardEditor(boardId: string): Promise<CurrentUser> {
  const user = await requireEditor();
  await requireBoardAccess(user, boardId);
  return user;
}

// Read-only counterpart of requireBoardEditor — signed in + board access,
// but viewers (readOnly role) are allowed through.
export async function requireBoardAccessAsUser(boardId: string): Promise<CurrentUser> {
  const user = await requireUser();
  await requireBoardAccess(user, boardId);
  return user;
}

async function requireBoardAccess(user: CurrentUser, boardId: string): Promise<void> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { environment: { select: { orgId: true } } },
  });
  if (!board || board.environment.orgId !== user.orgId) throw new Error("Board not found.");
  const allowed = allowedBoardIds(user);
  if (allowed && !allowed.includes(boardId)) throw new Error("Board not found.");
}
