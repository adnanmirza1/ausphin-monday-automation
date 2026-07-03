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
