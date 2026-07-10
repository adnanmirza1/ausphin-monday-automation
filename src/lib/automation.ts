import "server-only";
import { db } from "@/lib/db";
import { generateDocumentCore } from "@/lib/generate-doc";
import { sendMail } from "@/lib/mailer";
import { urlDisplay, parseFileValue } from "@/lib/cell-values";

// Events emitted by board mutations.
export type AutomationEvent =
  | { type: "item_created"; boardId: string; itemId: string }
  | { type: "status_changes"; boardId: string; itemId: string; columnId: string; value: string | null }
  | { type: "column_changes"; boardId: string; itemId: string; columnId: string; value: string | null }
  | { type: "person_assigned"; boardId: string; itemId: string; columnId: string; personId: string | null }
  | { type: "item_moved"; boardId: string; itemId: string; groupId: string };

type Trigger =
  | { type: "item_created" }
  | { type: "status_changes"; columnId: string; to: string } // to = labelId | "any"
  | { type: "column_changes"; columnId: string; when?: "any" | "not_empty" }
  | { type: "person_assigned"; columnId: string }
  | { type: "item_moved"; groupId: string }; // groupId | "any"

type Action =
  | { type: "move_to_group"; groupId: string }
  | { type: "set_status"; columnId: string; to: string }
  | { type: "notify"; target: "person" | "department"; targetId?: string; message: string }
  | { type: "assign_round_robin"; columnId: string; departmentId: string }
  | { type: "generate_document"; templateId: string }
  | { type: "request_invoice"; account: string; amountColumnId?: string }
  | { type: "send_email"; toColumnId?: string; subject: string; body: string }
  | { type: "create_item_in_board"; boardId: string; connect?: boolean };

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
  if (trigger.type === "column_changes" && event.type === "column_changes") {
    if (trigger.columnId !== event.columnId) return false;
    return trigger.when === "not_empty" ? !!event.value : true;
  }
  if (trigger.type === "person_assigned" && event.type === "person_assigned") {
    return trigger.columnId === event.columnId && !!event.personId;
  }
  if (trigger.type === "item_moved" && event.type === "item_moved") {
    return trigger.groupId === "any" || trigger.groupId === event.groupId;
  }
  return trigger.type === "item_created";
}

// Render {{Placeholders}} in email templates from an item's data.
async function renderTemplate(itemId: string, text: string): Promise<string> {
  const item = await db.item.findUnique({
    where: { id: itemId },
    include: { cells: { include: { column: true, person: true } } },
  });
  if (!item) return text;
  const map: Record<string, string> = { item: item.name, name: item.name };
  for (const c of item.cells) {
    let v = c.value ?? "";
    if (c.column.type === "status") {
      try {
        v = (JSON.parse(c.column.config).labels ?? []).find((l: { id: string }) => l.id === c.value)?.label ?? "";
      } catch {}
    } else if (c.column.type === "person") v = c.person?.name ?? "";
    else if (c.column.type === "url") v = urlDisplay(c.value);
    else if (c.column.type === "file") v = parseFileValue(c.value).map((f) => f.name).join(", ");
    map[c.column.name.toLowerCase()] = v;
  }
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => map[String(k).toLowerCase()] ?? "");
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

    case "send_email": {
      const it = await db.item.findUnique({
        where: { id: itemId },
        include: {
          cells: { include: { column: true } },
          board: { include: { environment: true } },
        },
      });
      if (!it) break;
      // Recipient = chosen email column, else the first email column on the item.
      const toCell = action.toColumnId
        ? it.cells.find((c) => c.columnId === action.toColumnId)
        : it.cells.find((c) => c.column.type === "email");
      const to = toCell?.value ?? "";
      const subject = await renderTemplate(itemId, action.subject || "");
      const body = await renderTemplate(itemId, action.body || "");
      if (to) {
        await sendMail({
          to,
          subject: subject || "(no subject)",
          html: `<p>${body.replace(/\n/g, "<br/>")}</p>`,
        });
      }
      // Record what was sent on the item's timeline (so it's visible even in dev).
      await db.update.create({
        data: {
          itemId,
          body: `✉ Automated email${to ? ` → ${to}` : " (no recipient)"}: ${subject}\n\n${body}`,
          mentions: "[]",
        },
      });
      // Record on the item's email conversation history (Missing #2).
      if (to) {
        await db.emailMessage.create({
          data: {
            orgId: it.board.environment.orgId,
            itemId,
            direction: "outbound",
            status: "sent",
            fromEmail: process.env.SMTP_FROM || "",
            toEmail: to,
            subject,
            body,
          },
        });
      }
      break;
    }

    case "create_item_in_board": {
      const src = await db.item.findUnique({
        where: { id: itemId },
        include: { cells: { include: { column: true } }, board: { include: { columns: true } } },
      });
      if (!src) break;
      const targetGroup = await db.group.findFirst({
        where: { boardId: action.boardId },
        orderBy: { position: "asc" },
      });
      if (!targetGroup) break;
      const count = await db.item.count({ where: { groupId: targetGroup.id } });
      const newItem = await db.item.create({
        data: { boardId: action.boardId, groupId: targetGroup.id, name: src.name, position: count },
      });
      // Copy the email value across so the two records can be matched/mirrored.
      const srcEmail = src.cells.find((c) => c.column.type === "email");
      if (srcEmail?.value) {
        const targetEmailCol = await db.column.findFirst({
          where: { boardId: action.boardId, type: "email" },
        });
        if (targetEmailCol)
          await db.cell.create({
            data: { itemId: newItem.id, columnId: targetEmailCol.id, value: srcEmail.value },
          });
      }
      // Optionally link the source item to the new one via a connection column
      // on the source board that targets action.boardId (enables mirrors).
      if (action.connect) {
        const connCol = src.board.columns.find((c) => {
          if (c.type !== "connection") return false;
          try {
            return JSON.parse(c.config).targetBoardId === action.boardId;
          } catch {
            return false;
          }
        });
        if (connCol)
          await db.cell.upsert({
            where: { itemId_columnId: { itemId, columnId: connCol.id } },
            create: { itemId, columnId: connCol.id, value: newItem.id },
            update: { value: newItem.id },
          });
      }
      await runAutomations({ type: "item_created", boardId: action.boardId, itemId: newItem.id });
      break;
    }
  }
}
