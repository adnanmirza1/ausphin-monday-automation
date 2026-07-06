"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { PALETTE } from "@/lib/constants";

// Environments are created by admins/developers (Part 1 / Part 16).
export async function createEnvironment(name: string): Promise<string | null> {
  const admin = await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return null;
  const count = await db.environment.count({ where: { orgId: admin.orgId } });
  const env = await db.environment.create({
    data: {
      orgId: admin.orgId,
      name: trimmed,
      color: PALETTE[count % PALETTE.length],
      position: count,
    },
  });
  revalidatePath("/", "layout");
  return env.id;
}

export async function renameEnvironment(id: string, name: string) {
  const admin = await requireAdmin();
  const env = await db.environment.findUnique({ where: { id } });
  if (!env || env.orgId !== admin.orgId) return;
  await db.environment.update({ where: { id }, data: { name: name.trim() || env.name } });
  revalidatePath("/", "layout");
}

export async function setEnvironmentColor(id: string, color: string) {
  const admin = await requireAdmin();
  const env = await db.environment.findUnique({ where: { id } });
  if (!env || env.orgId !== admin.orgId) return;
  await db.environment.update({ where: { id }, data: { color } });
  revalidatePath("/", "layout");
}

// Soft-delete → moves to Archive/Trash (restorable). Uses raw now() via update.
export async function archiveEnvironment(id: string) {
  const admin = await requireAdmin();
  const env = await db.environment.findUnique({ where: { id } });
  if (!env || env.orgId !== admin.orgId) return;
  await db.environment.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function restoreEnvironment(id: string) {
  const admin = await requireAdmin();
  const env = await db.environment.findUnique({ where: { id } });
  if (!env || env.orgId !== admin.orgId) return;
  await db.environment.update({ where: { id }, data: { archivedAt: null } });
  revalidatePath("/", "layout");
}

// Permanent delete (from Archive/Trash) — irreversible, cascades to boards/data.
export async function deleteEnvironment(id: string) {
  const admin = await requireAdmin();
  const env = await db.environment.findUnique({ where: { id } });
  if (!env || env.orgId !== admin.orgId) return;
  await db.environment.delete({ where: { id } });
  revalidatePath("/", "layout");
}
