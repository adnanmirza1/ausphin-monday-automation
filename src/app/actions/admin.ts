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

export async function createUser(formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleId = String(formData.get("roleId") ?? "") || null;
  const departmentId = String(formData.get("departmentId") ?? "") || null;
  if (!name || !email) return;

  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return;

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
}

// ── Departments ──────────────────────────────────────────────
export async function addDepartment(formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#0B7A6F");
  if (!name) return;
  await db.department.create({ data: { orgId: admin.orgId, name, color } });
  touch();
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

export async function addRole(formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#5B7A99");
  const readOnly = formData.get("readOnly") === "on";
  const boards = formData.getAll("boards").map(String);
  if (!name) return;
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
