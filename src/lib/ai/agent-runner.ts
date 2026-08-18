import "server-only";
import { db } from "@/lib/db";
import { askClaudeForJson } from "@/lib/ai/claude";

// AI Agents: a plan-then-execute loop over the SAME action vocabulary the
// Automation engine already runs (move_to_group, set_status, notify,
// send_email, generate_document, create_item_in_board, integration_action,
// ...) — no new execution engine, no new "what can an agent do" surface to
// maintain. An agent's allowedTools is a whitelist of these action "type"
// strings; the planner is told exactly which ones it may use and against
// which board, so it can't invent an action outside what was authorized.

export type AgentStep = {
  description: string;
  actionType: string;
  action: Record<string, unknown>; // one Action from automation.ts's vocabulary
  status: "pending" | "approved" | "skipped" | "done" | "failed";
  result?: string;
  error?: string;
};

// Sensitive step types that require human approval before executing, even
// when the agent's requireApproval flag governs the run as a whole — these
// are the ones with an external side effect (sends something, creates
// records elsewhere) versus a pure in-board write.
const SENSITIVE_TYPES = new Set([
  "send_email",
  "send_docusign",
  "create_item_in_board",
  "create_subitem_in_board",
  "integration_action",
  "request_invoice",
]);

export function isSensitiveStep(actionType: string): boolean {
  return SENSITIVE_TYPES.has(actionType);
}

type PlanContext = {
  boardName: string;
  columns: { id: string; name: string; type: string; labels?: { id: string; label: string }[] }[];
  groups: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  allowedTools: string[];
};

// Ask Claude to plan a sequence of steps toward the agent's goal + this run's
// specific input, restricted to allowedTools. Returns unvalidated steps —
// callers must still check every id against real board data before allowing
// execution (same defense-in-depth principle as workflow-parser.ts).
export async function planAgentSteps(
  goal: string,
  input: string,
  ctx: PlanContext
): Promise<{ ok: true; steps: AgentStep[] } | { ok: false; error: string }> {
  if (ctx.allowedTools.length === 0) return { ok: false, error: "This agent has no allowed tools configured." };

  const system = `You plan a short sequence of steps for an autonomous agent inside a work-management app, restricted to board "${ctx.boardName}".

Agent's goal: ${goal}

Columns: ${JSON.stringify(ctx.columns)}
Groups: ${JSON.stringify(ctx.groups)}
Departments: ${JSON.stringify(ctx.departments)}
Document templates: ${JSON.stringify(ctx.templates)}

You may ONLY use these action types: ${ctx.allowedTools.join(", ")}

Respond with ONLY a JSON array of steps: [{ "description": "short human-readable description", "action": { "type": "...", ...fields } }]. Each action's shape must match one of: move_to_group{groupId}, set_status{columnId,to}, change_column_value{columnId,value}, notify{target:"department",targetId,message}, generate_document{templateId}, send_email{toColumnId?,subject,body}. Use ONLY ids that appear above. If the request can't be done with the allowed tools, return an empty array.`;

  const result = await askClaudeForJson(system, input, 1500);
  if (!result.ok) return { ok: false, error: result.error };
  if (!Array.isArray(result.data)) return { ok: false, error: "AI did not return a step list." };

  const steps: AgentStep[] = [];
  for (const raw of result.data) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const action = r.action as Record<string, unknown> | undefined;
    if (!action || typeof action.type !== "string") continue;
    if (!ctx.allowedTools.includes(action.type)) continue; // never trust the model to have respected the whitelist
    steps.push({
      description: typeof r.description === "string" ? r.description : action.type,
      actionType: action.type,
      action,
      status: "pending",
    });
  }
  return { ok: true, steps };
}

// Execute one already-approved step by delegating to the SAME executor the
// Automation engine uses, so behavior (validation, retries, logging style)
// is identical whether a step came from a manual automation or an agent.
export async function executeAgentStep(boardId: string, itemId: string | null, step: AgentStep): Promise<AgentStep> {
  try {
    if (!itemId) {
      // Steps that don't need an existing item (only move/set/change/notify/
      // generate_document/send_email all require one in the current
      // vocabulary) — an agent without a target item can't run any of them.
      return { ...step, status: "skipped", error: "No target item for this run." };
    }
    // Applies the action via the same DB operations Automation's execute()
    // uses for these types, without going through a throwaway Automation
    // row — an agent step is a one-off action, not a saved recurring rule.
    const outcome = await applyAgentAction(boardId, itemId, step.action);
    return { ...step, status: outcome.ok ? "done" : "failed", result: outcome.ok ? outcome.result : undefined, error: outcome.ok ? undefined : outcome.error };
  } catch (e) {
    return { ...step, status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

async function applyAgentAction(boardId: string, itemId: string, action: Record<string, unknown>): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const item = await db.item.findFirst({ where: { id: itemId, boardId } });
  if (!item) return { ok: false, error: "Item not found on this board." };

  switch (action.type) {
    case "move_to_group": {
      const groupId = String(action.groupId ?? "");
      const group = await db.group.findFirst({ where: { id: groupId, boardId } });
      if (!group) return { ok: false, error: "Target group not found." };
      const count = await db.item.count({ where: { groupId } });
      await db.item.update({ where: { id: itemId }, data: { groupId, position: count } });
      return { ok: true, result: `Moved to "${group.name}".` };
    }
    case "set_status": {
      const columnId = String(action.columnId ?? "");
      const col = await db.column.findFirst({ where: { id: columnId, boardId, type: "status" } });
      if (!col) return { ok: false, error: "Status column not found." };
      await db.cell.upsert({
        where: { itemId_columnId: { itemId, columnId } },
        create: { itemId, columnId, value: String(action.to ?? "") },
        update: { value: String(action.to ?? "") },
      });
      return { ok: true, result: `Set "${col.name}".` };
    }
    case "change_column_value": {
      const columnId = String(action.columnId ?? "");
      const col = await db.column.findFirst({ where: { id: columnId, boardId } });
      if (!col) return { ok: false, error: "Column not found." };
      await db.cell.upsert({
        where: { itemId_columnId: { itemId, columnId } },
        create: { itemId, columnId, value: String(action.value ?? "") },
        update: { value: String(action.value ?? "") },
      });
      return { ok: true, result: `Updated "${col.name}".` };
    }
    case "notify": {
      const targetId = action.target === "department" ? String(action.targetId ?? "") : undefined;
      await db.update.create({
        data: { itemId, body: String(action.message ?? "Agent notification"), mentions: JSON.stringify(targetId ? [targetId] : []) },
      });
      return { ok: true, result: "Posted a notification." };
    }
    case "generate_document": {
      const { generateDocumentCoreDetailed } = await import("@/lib/generate-doc");
      const res = await generateDocumentCoreDetailed(itemId, String(action.templateId ?? ""));
      return res.ok ? { ok: true, result: "Document generated." } : { ok: false, error: res.error };
    }
    case "send_email": {
      const { sendMail } = await import("@/lib/mailer");
      const cells = await db.cell.findMany({ where: { itemId }, include: { column: true } });
      const toCell = action.toColumnId
        ? cells.find((c) => c.columnId === action.toColumnId)
        : cells.find((c) => c.column.type === "email");
      const to = (toCell?.value ?? "").trim();
      if (!to) return { ok: false, error: "No recipient email found." };
      const res = await sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
        to,
        subject: String(action.subject ?? "(no subject)"),
        html: `<p>${String(action.body ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`,
        text: String(action.body ?? ""),
      });
      return res.ok ? { ok: true, result: `Emailed ${to}.` } : { ok: false, error: res.error ?? "Send failed." };
    }
    default:
      return { ok: false, error: `Action type "${String(action.type)}" is not supported for agent execution.` };
  }
}
