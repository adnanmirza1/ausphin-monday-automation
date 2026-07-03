import "server-only";
import { db } from "@/lib/db";

// Days between today (local, date-only) and an ISO/date string. Positive = future.
export function daysUntil(dateStr: string, now = new Date()): number | null {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}

function parseOffsets(raw: string): number[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(Number).filter((n) => !isNaN(n)) : [];
  } catch {
    return [];
  }
}

export type ReminderFire = {
  ruleId: string;
  ruleName: string;
  itemId: string;
  itemName: string;
  offsetDays: number;
  dateStr: string;
};

// Evaluate all enabled rules and fire any due reminders that haven't fired yet.
// Returns the list of fired reminders. Idempotent per (rule,item,offset).
export async function runReminders(orgId?: string, now = new Date()): Promise<ReminderFire[]> {
  const rules = await db.reminderRule.findMany({
    where: { enabled: true, ...(orgId ? { board: { environment: { orgId } } } : {}) },
  });

  const fired: ReminderFire[] = [];

  for (const rule of rules) {
    const offsets = parseOffsets(rule.offsets);
    if (offsets.length === 0) continue;

    const cells = await db.cell.findMany({
      where: { columnId: rule.dateColumnId, value: { not: null } },
      include: { item: true },
    });

    for (const cell of cells) {
      if (!cell.value || !cell.item) continue;
      const d = daysUntil(cell.value, now);
      if (d === null) continue;
      if (!offsets.includes(d)) continue;

      // Dedupe via unique (ruleId, itemId, offsetDays).
      try {
        await db.reminderLog.create({
          data: { ruleId: rule.id, itemId: cell.item.id, offsetDays: d },
        });
      } catch {
        continue; // already fired
      }

      const label = d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`;
      const body =
        (rule.message || rule.name) + ` — ${cell.item.name}: ${cell.value} (${label}).`;
      await db.update.create({
        data: {
          itemId: cell.item.id,
          body,
          mentions: JSON.stringify(rule.notifyDepartmentId ? [rule.notifyDepartmentId] : []),
        },
      });
      // (Real integration also emails the notified department here.)

      fired.push({
        ruleId: rule.id,
        ruleName: rule.name,
        itemId: cell.item.id,
        itemName: cell.item.name,
        offsetDays: d,
        dateStr: cell.value,
      });
    }
  }

  return fired;
}

// Preview upcoming reminders (next `horizon` days) without firing anything.
export type UpcomingRow = {
  ruleName: string;
  itemName: string;
  dateStr: string;
  daysLeft: number;
};

export async function upcomingReminders(
  boardId: string,
  horizon = 45,
  now = new Date()
): Promise<UpcomingRow[]> {
  const rules = await db.reminderRule.findMany({ where: { boardId, enabled: true } });
  const rows: UpcomingRow[] = [];

  for (const rule of rules) {
    const offsets = parseOffsets(rule.offsets);
    const cells = await db.cell.findMany({
      where: { columnId: rule.dateColumnId, value: { not: null } },
      include: { item: true },
    });
    for (const cell of cells) {
      if (!cell.value || !cell.item) continue;
      const d = daysUntil(cell.value, now);
      if (d === null || d < 0 || d > horizon) continue;
      rows.push({
        ruleName: rule.name,
        itemName: cell.item.name,
        dateStr: cell.value,
        daysLeft: d,
      });
      void offsets;
    }
  }

  return rows.sort((a, b) => a.daysLeft - b.daysLeft);
}
