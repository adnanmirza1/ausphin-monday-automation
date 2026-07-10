import "server-only";
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
