import "server-only";
import { db } from "@/lib/db";
import { generateDocumentCore } from "@/lib/generate-doc";

// Events emitted by board mutations.
export type AutomationEvent =
  | { type: "item_created"; boardId: string; itemId: string }
  | {
      type: "status_changes";
      boardId: string;
      itemId: string;
      columnId: string;
      value: string | null;
    };

type Trigger =
  | { type: "item_created" }
  | { type: "status_changes"; columnId: string; to: string }; // to = labelId | "any"

type Action =
  | { type: "move_to_group"; groupId: string }
  | { type: "set_status"; columnId: string; to: string }
  | { type: "notify"; target: "person" | "department"; targetId?: string; message: string }
  | { type: "assign_round_robin"; columnId: string; departmentId: string }
  | { type: "generate_document"; templateId: string }
  | { type: "request_invoice"; account: string; amountColumnId?: string };

function parse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function matches(trigger: Trigger, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false;
  if (trigger.type === "status_changes" && event.type === "status_changes") {
    if (trigger.columnId !== event.columnId) return false;
    return trigger.to === "any" || trigger.to === event.value;
  }
  return trigger.type === "item_created";
}

// Runs a single non-recursive pass of automations for the board & event.
export async function runAutomations(event: AutomationEvent) {
  const automations = await db.automation.findMany({
    where: { boardId: event.boardId, enabled: true },
  });

  for (const a of automations) {
    const trigger = parse<Trigger>(a.trigger);
    const action = parse<Action>(a.action);
    if (!trigger || !action) continue;
    if (!matches(trigger, event)) continue;
    await execute(action, event);
  }
}

async function execute(action: Action, event: AutomationEvent) {
  const itemId = event.itemId;

  switch (action.type) {
    case "move_to_group": {
      const count = await db.item.count({ where: { groupId: action.groupId } });
      await db.item.update({
        where: { id: itemId },
        data: { groupId: action.groupId, position: count },
      });
      break;
    }

    case "set_status": {
      await db.cell.upsert({
        where: { itemId_columnId: { itemId, columnId: action.columnId } },
        create: { itemId, columnId: action.columnId, value: action.to },
        update: { value: action.to },
      });
      break;
    }

    case "notify": {
      await db.update.create({
        data: {
          itemId,
          body: action.message || "Automation notification",
          mentions: JSON.stringify(action.targetId ? [action.targetId] : []),
        },
      });
      break;
    }

    case "assign_round_robin": {
      const people = await db.user.findMany({
        where: { departmentId: action.departmentId, status: { not: "inactive" } },
        select: { id: true },
      });
      if (people.length === 0) break;
      // pick the person with the fewest current assignments in this column
      const counts = await Promise.all(
        people.map(async (p) => ({
          id: p.id,
          n: await db.cell.count({
            where: { columnId: action.columnId, personId: p.id },
          }),
        }))
      );
      counts.sort((a, b) => a.n - b.n);
      const chosen = counts[0].id;
      await db.cell.upsert({
        where: { itemId_columnId: { itemId, columnId: action.columnId } },
        create: { itemId, columnId: action.columnId, personId: chosen, value: chosen },
        update: { personId: chosen, value: chosen },
      });
      break;
    }

    case "generate_document": {
      await generateDocumentCore(itemId, action.templateId);
      break;
    }

    case "request_invoice": {
      const it = await db.item.findUnique({
        where: { id: itemId },
        include: { cells: { include: { column: true } }, board: { include: { environment: true } } },
      });
      if (!it) break;
      const emailCell = it.cells.find((c) => c.column.type === "email");
      const amountCell = action.amountColumnId
        ? it.cells.find((c) => c.columnId === action.amountColumnId)
        : undefined;
      const amountCents = amountCell?.value
        ? Math.round(Number(amountCell.value.replace(/[^0-9.]/g, "")) * 100)
        : 0;
      await db.invoice.create({
        data: {
          orgId: it.board.environment.orgId,
          account: action.account || "pty",
          candidateName: it.name,
          candidateEmail: emailCell?.value ?? "",
          amountCents,
          description: `Auto-request from ${it.board.name}`,
          department: it.board.name,
          status: "requested",
        },
      });
      break;
    }
  }
}
