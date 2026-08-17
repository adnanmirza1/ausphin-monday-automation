"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor, requireAdmin, requireBoardEditor, requireBoardAccessAsUser } from "@/lib/guard";

function touch(boardId?: string) {
  revalidatePath("/employers");
  if (boardId) revalidatePath(`/boards/${boardId}`);
}

export async function createEmployer(formData: FormData) {
  const user = await requireEditor();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();
  const exists = await db.employer.findFirst({ where: { orgId: user.orgId, name } });
  if (exists) return;
  await db.employer.create({
    data: { orgId: user.orgId, name, contactEmail, contactPhone },
  });
  touch();
}

export async function deleteEmployer(id: string) {
  const admin = await requireAdmin();
  await db.employer.deleteMany({ where: { id, orgId: admin.orgId } });
  touch();
}

// Tag a candidate (item) to an employer with a stage. Upserts on (employer,item).
// Employer.orgId is re-checked against the caller's org, and the employer
// row itself must exist in that org, before the tag write happens.
export async function tagCandidate(
  boardId: string,
  itemId: string,
  employerId: string,
  stage: string
) {
  const user = await requireBoardEditor(boardId);
  const item = await db.item.findFirst({ where: { id: itemId, boardId }, select: { id: true } });
  if (!item) throw new Error("Item not found on this board.");
  const employer = await db.employer.findFirst({ where: { id: employerId, orgId: user.orgId }, select: { id: true } });
  if (!employer) throw new Error("Employer not found.");
  await db.candidateTag.upsert({
    where: { employerId_itemId: { employerId, itemId } },
    create: { employerId, itemId, stage },
    update: { stage },
  });
  touch(boardId);
}

export async function setTagStage(boardId: string, tagId: string, stage: string) {
  await requireBoardEditor(boardId);
  await db.candidateTag.updateMany({
    where: { id: tagId, item: { boardId } },
    data: { stage },
  });
  touch(boardId);
}

export async function untagCandidate(boardId: string, tagId: string) {
  await requireBoardEditor(boardId);
  await db.candidateTag.deleteMany({ where: { id: tagId, item: { boardId } } });
  touch(boardId);
}

export type ItemTag = {
  id: string;
  employerId: string;
  employerName: string;
  stage: string;
};

export async function getItemTags(boardId: string, itemId: string): Promise<ItemTag[]> {
  await requireBoardAccessAsUser(boardId);
  const tags = await db.candidateTag.findMany({
    where: { itemId, item: { boardId } },
    include: { employer: true },
    orderBy: { createdAt: "asc" },
  });
  return tags.map((t) => ({
    id: t.id,
    employerId: t.employerId,
    employerName: t.employer.name,
    stage: t.stage,
  }));
}
