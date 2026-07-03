"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/guard";
import { runReminders, type ReminderFire } from "@/lib/reminders";

function touch(boardId: string) {
  revalidatePath(`/boards/${boardId}/reminders`);
  revalidatePath(`/boards/${boardId}`);
}

export type ReminderInput = {
  name: string;
  dateColumnId: string;
  offsets: number[];
  notifyDepartmentId: string | null;
  message: string;
};

export async function createReminderRule(boardId: string, input: ReminderInput) {
  await requireEditor();
  if (!input.dateColumnId) return;
  await db.reminderRule.create({
    data: {
      boardId,
      name: input.name.trim() || "Reminder",
      dateColumnId: input.dateColumnId,
      offsets: JSON.stringify(input.offsets.length ? input.offsets : [7, 3, 1]),
      notifyDepartmentId: input.notifyDepartmentId,
      message: input.message.trim(),
    },
  });
  touch(boardId);
}

export async function toggleReminderRule(boardId: string, id: string, enabled: boolean) {
  await requireEditor();
  await db.reminderRule.update({ where: { id }, data: { enabled } });
  touch(boardId);
}

export async function deleteReminderRule(boardId: string, id: string) {
  await requireEditor();
  await db.reminderRule.delete({ where: { id } });
  touch(boardId);
}

// Manual trigger (also used for demo). Returns fired reminders count.
export async function runRemindersNow(boardId: string): Promise<ReminderFire[]> {
  const user = await requireEditor();
  const fired = await runReminders(user.orgId);
  touch(boardId);
  return fired;
}
