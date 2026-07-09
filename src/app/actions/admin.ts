"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { PALETTE } from "@/lib/constants";

function touch() {
  revalidatePath("/admin");
  revalidatePath("/", "layout");
}

// ── Users ────────────────────────────────────────────────────
export async function setUserRole(userId: string, roleId: string | null) {
  await requireAdmin();
  await db.user.update({ where: { id: userId }, data: { roleId } });
  touch();
}

export async function setUserDepartment(userId: string, departmentId: string | null) {
  await requireAdmin();
  await db.user.update({ where: { id: userId }, data: { departmentId } });
  touch();
}

export async function setUserStatus(userId: string, status: string) {
  await requireAdmin();
  await db.user.update({ where: { id: userId }, data: { status } });
  touch();
}

// Set (or clear with null) a user's profile picture. `dataUrl` is a data: URL.
export async function setUserAvatar(userId: string, dataUrl: string | null) {
  await requireAdmin();
  if (dataUrl && dataUrl.length > 1_500_000) return; // ~1.5MB cap
  await db.user.update({ where: { id: userId }, data: { avatarUrl: dataUrl } });
  touch();
}

// Edit a user's name / email. Returns an error string or null.
export async function editUser(
  userId: string,
  name: string,
  email: string
): Promise<string | null> {
  await requireAdmin();
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName || !cleanEmail) return "Name and email are required.";
  const clash = await db.user.findFirst({
    where: { email: cleanEmail, id: { not: userId } },
    select: { id: true },
  });
  if (clash) return "Another user already uses this email.";
  await db.user.update({ where: { id: userId }, data: { name: cleanName, email: cleanEmail } });
  touch();
  return null;
}

// Permanently delete a user. Clears their references first, and never allows
// deleting yourself. (For preserving history, set status to Viewer instead.)
export async function deleteUser(userId: string): Promise<string | null> {
  const admin = await requireAdmin();
  if (admin.id === userId) return "You can't delete your own account.";
  await db.$transaction([
    db.session.deleteMany({ where: { userId } }),
    db.cell.updateMany({ where: { personId: userId }, data: { personId: null } }),
    db.update.updateMany({ where: { authorId: userId }, data: { authorId: null } }),
    db.invitation.updateMany({ where: { invitedBy: userId }, data: { invitedBy: null } }),
    db.user.delete({ where: { id: userId } }),
  ]);
  touch();
  return null;
}

export async function createUser(
  _prev: string | null,
  formData: FormData
): Promise<string | null> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleId = String(formData.get("roleId") ?? "") || null;
  const departmentId = String(formData.get("departmentId") ?? "") || null;
  if (!name || !email) return "Name and email are required.";

  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return `A user with email “${email}” already exists.`;

  await db.user.create({
    data: {
      orgId: admin.orgId,
      name,
      email,
      roleId,
      departmentId,
      passwordHash: await hashPassword("password"),
      avatarColor: PALETTE[Math.floor(name.length % PALETTE.length)],
      status: "active",
    },
  });
  touch();
  return null;
}

// ── Departments ──────────────────────────────────────────────
export async function addDepartment(
  _prev: string | null,
  formData: FormData
): Promise<string | null> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#0B7A6F");
  if (!name) return "Department name is required.";
  const exists = await db.department.findFirst({
    where: { orgId: admin.orgId, name: { equals: name, mode: "insensitive" } },
  });
  if (exists) return `Department “${name}” already exists.`;
  await db.department.create({ data: { orgId: admin.orgId, name, color } });
  touch();
  return null;
}

export async function deleteDepartment(id: string) {
  await requireAdmin();
  await db.department.delete({ where: { id } });
  touch();
}

// ── Roles ────────────────────────────────────────────────────
function buildPerms(readOnly: boolean, boards: string[]) {
  const scope = boards.length ? boards : "all";
  return JSON.stringify(
    readOnly
      ? { boards: scope, readOnly: true }
      : { boards: scope, canEditItems: true, canBuildAutomations: true }
  );
}

export async function addRole(
  _prev: string | null,
  formData: FormData
): Promise<string | null> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#5B7A99");
  const readOnly = formData.get("readOnly") === "on";
  const boards = formData.getAll("boards").map(String);
  if (!name) return "Role name is required.";
  const exists = await db.role.findFirst({
    where: { orgId: admin.orgId, name: { equals: name, mode: "insensitive" } },
  });
  if (exists) return `Role “${name}” already exists.`;
  await db.role.create({
    data: {
      orgId: admin.orgId,
      name,
      color,
      rank: 60,
      isSystem: false,
      permissions: buildPerms(readOnly, boards),
    },
  });
  touch();
  return null;
}

export async function editRole(
  id: string,
  name: string,
  color: string,
  readOnly: boolean,
  boards: string[]
) {
  await requireAdmin();
  const role = await db.role.findUnique({ where: { id } });
  if (!role) return;
  // System roles: allow name/color only (keep their permission set).
  const data: { name: string; color: string; permissions?: string } = {
    name: name.trim() || role.name,
    color,
  };
  if (!role.isSystem) data.permissions = buildPerms(readOnly, boards);
  await db.role.update({ where: { id }, data });
  touch();
}

export async function deleteRole(id: string) {
  await requireAdmin();
  const role = await db.role.findUnique({ where: { id } });
  if (role?.isSystem) return; // never delete system roles
  await db.role.delete({ where: { id } });
  touch();
}

export async function editDepartment(id: string, name: string, color: string) {
  await requireAdmin();
  await db.department.update({
    where: { id },
    data: { name: name.trim(), color },
  });
  touch();
}

// ── Invitations ──────────────────────────────────────────────
export async function createInvitation(formData: FormData) {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleId = String(formData.get("roleId") ?? "") || null;
  if (!email) return;
  await db.invitation.create({
    data: { orgId: admin.orgId, email, roleId, invitedBy: admin.id },
  });
  touch();
}

export async function revokeInvitation(id: string) {
  await requireAdmin();
  await db.invitation.update({ where: { id }, data: { status: "revoked" } });
  touch();
}
