"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor, requireAdmin, requireUser } from "@/lib/guard";

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
  await requireAdmin();
  await db.employer.delete({ where: { id } });
  touch();
}

// Tag a candidate (item) to an employer with a stage. Upserts on (employer,item).
export async function tagCandidate(
  boardId: string,
  itemId: string,
  employerId: string,
  stage: string
) {
  await requireEditor();
  await db.candidateTag.upsert({
    where: { employerId_itemId: { employerId, itemId } },
    create: { employerId, itemId, stage },
    update: { stage },
  });
  touch(boardId);
}

export async function setTagStage(boardId: string, tagId: string, stage: string) {
  await requireEditor();
  await db.candidateTag.update({ where: { id: tagId }, data: { stage } });
  touch(boardId);
}

export async function untagCandidate(boardId: string, tagId: string) {
  await requireEditor();
  await db.candidateTag.delete({ where: { id: tagId } });
  touch(boardId);
}

export type ItemTag = {
  id: string;
  employerId: string;
  employerName: string;
  stage: string;
};

export async function getItemTags(itemId: string): Promise<ItemTag[]> {
  await requireUser();
  const tags = await db.candidateTag.findMany({
    where: { itemId },
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
