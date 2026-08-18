import "server-only";

// Natural-language -> Automation JSON, via the Claude Messages API directly
// (plain fetch, same pattern as every other outbound integration in this
// codebase — no SDK needed for a single structured-output call). Reuses the
// EXISTING Automation model's {trigger, action} shape rather than a parallel
// workflow schema, so a parsed prompt becomes a normal automation the user
// can see, edit, and run through in the automations panel/history they
// already have.

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

export type ParsedWorkflow = {
  name: string;
  trigger: Record<string, unknown>;
  action: Record<string, unknown>;
};

export type ParseContext = {
  // Real column/group/board names + ids from the target board, so the model
  // can only reference things that actually exist — never invents a column.
  boardName: string;
  columns: { id: string; name: string; type: string; labels?: { id: string; label: string }[] }[];
  groups: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  otherBoards: { id: string; name: string }[];
};

const TRIGGER_SCHEMA = `
- { "type": "item_created" }
- { "type": "status_changes", "columnId": string, "to": labelId | "any" }
- { "type": "column_changes", "columnId": string, "when": "any" | "not_empty" }
- { "type": "person_assigned", "columnId": string }
- { "type": "item_moved", "groupId": groupId | "any" }`.trim();

const ACTION_SCHEMA = `
- { "type": "move_to_group", "groupId": string }
- { "type": "set_status", "columnId": string, "to": labelId }
- { "type": "change_column_value", "columnId": string, "value": string }
- { "type": "notify", "target": "department", "targetId": string, "message": string }
- { "type": "assign_round_robin", "columnId": string, "departmentId": string }
- { "type": "generate_document", "templateId": string }
- { "type": "send_email", "toColumnId"?: string, "subject": string, "body": string }
- { "type": "set_date", "columnId": string, "mode": "specific"|"today"|"offset", "date"?: "YYYY-MM-DD", "offsetDays"?: number }
- { "type": "create_item_in_board", "boardId": string, "connect"?: boolean }
- { "type": "create_subitem_by_email", "emailColumnId"?: string }`.trim();

// Never throws — resolves {ok, error} like every other outbound call in this
// codebase, so callers can surface a clean error instead of a 500.
export async function parseWorkflowPrompt(
  prompt: string,
  ctx: ParseContext
): Promise<{ ok: true; workflow: ParsedWorkflow } | { ok: false; error: string }> {
  if (!aiConfigured()) return { ok: false, error: "AI is not configured — add ANTHROPIC_API_KEY." };
  if (!prompt.trim()) return { ok: false, error: "Describe the workflow first." };

  const system = `You convert a plain-English work-process description into ONE automation rule for a work-management app, expressed as strict JSON: {"name": string, "trigger": Trigger, "action": Action}.

Board: "${ctx.boardName}"
Columns: ${JSON.stringify(ctx.columns)}
Groups: ${JSON.stringify(ctx.groups)}
Departments: ${JSON.stringify(ctx.departments)}
Document templates: ${JSON.stringify(ctx.templates)}
Other boards (for create_item_in_board): ${JSON.stringify(ctx.otherBoards)}

Allowed Trigger shapes (pick exactly one):
${TRIGGER_SCHEMA}

Allowed Action shapes (pick one, or return {"type":"multi","actions":[...]} for several in order):
${ACTION_SCHEMA}

Rules:
- ONLY reference column/group/department/template/board ids that appear above. Never invent an id.
- If the prompt doesn't map cleanly to an available trigger/action, pick the closest reasonable interpretation using what's available — don't fail silently.
- "name" is a short human label for the rule, e.g. "Notify HR on new hire".
- Respond with ONLY the JSON object, no prose, no markdown fences.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: prompt.trim() }],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `AI request failed: ${res.status} ${text.slice(0, 300)}` };
    }
    const j = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = j.content.find((c) => c.type === "text")?.text ?? "";
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, error: "AI returned an unparseable response — try rephrasing the prompt." };
    }
    const wf = validateWorkflow(parsed, ctx);
    if (!wf.ok) return wf;
    return { ok: true, workflow: wf.workflow };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Defense in depth: never trust the model's output blindly. Re-validate every
// referenced id actually exists on this board before it's allowed to become
// a real Automation row — same principle as applyFieldMapping/execute() in
// automation.ts never trusting a stored id without checking it still exists.
function validateWorkflow(
  raw: unknown,
  ctx: ParseContext
): { ok: true; workflow: ParsedWorkflow } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "AI response was not an object." };
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : "AI-generated workflow";
  const trigger = r.trigger;
  const action = r.action;
  if (!trigger || typeof trigger !== "object") return { ok: false, error: "AI response is missing a trigger." };
  if (!action || typeof action !== "object") return { ok: false, error: "AI response is missing an action." };

  const columnIds = new Set(ctx.columns.map((c) => c.id));
  const groupIds = new Set(ctx.groups.map((g) => g.id));
  const deptIds = new Set(ctx.departments.map((d) => d.id));
  const templateIds = new Set(ctx.templates.map((t) => t.id));
  const boardIds = new Set(ctx.otherBoards.map((b) => b.id));

  const t = trigger as Record<string, unknown>;
  switch (t.type) {
    case "item_created":
      break;
    case "status_changes":
    case "column_changes":
    case "person_assigned":
      if (typeof t.columnId !== "string" || !columnIds.has(t.columnId))
        return { ok: false, error: `AI referenced an unknown column in the trigger.` };
      break;
    case "item_moved":
      if (t.groupId !== "any" && (typeof t.groupId !== "string" || !groupIds.has(t.groupId)))
        return { ok: false, error: `AI referenced an unknown group in the trigger.` };
      break;
    default:
      return { ok: false, error: `AI returned an unsupported trigger type "${String(t.type)}".` };
  }

  const actionObj = action as Record<string, unknown>;
  const actions = actionObj.type === "multi" && Array.isArray(actionObj.actions)
    ? (actionObj.actions as unknown[])
    : [actionObj];
  for (const actionRaw of actions) {
    if (!actionRaw || typeof actionRaw !== "object") return { ok: false, error: "AI returned an invalid action." };
    const a = actionRaw as Record<string, unknown>;
    switch (a.type) {
      case "move_to_group":
        if (typeof a.groupId !== "string" || !groupIds.has(a.groupId))
          return { ok: false, error: "AI referenced an unknown group in an action." };
        break;
      case "set_status":
      case "change_column_value":
      case "set_date":
        if (typeof a.columnId !== "string" || !columnIds.has(a.columnId))
          return { ok: false, error: "AI referenced an unknown column in an action." };
        break;
      case "assign_round_robin":
        if (typeof a.columnId !== "string" || !columnIds.has(a.columnId))
          return { ok: false, error: "AI referenced an unknown column in an action." };
        if (typeof a.departmentId !== "string" || !deptIds.has(a.departmentId))
          return { ok: false, error: "AI referenced an unknown department in an action." };
        break;
      case "notify":
        if (a.target === "department" && (typeof a.targetId !== "string" || !deptIds.has(a.targetId)))
          return { ok: false, error: "AI referenced an unknown department in a notify action." };
        break;
      case "generate_document":
        if (typeof a.templateId !== "string" || !templateIds.has(a.templateId))
          return { ok: false, error: "AI referenced an unknown document template." };
        break;
      case "create_item_in_board":
        if (typeof a.boardId !== "string" || !boardIds.has(a.boardId))
          return { ok: false, error: "AI referenced an unknown board." };
        break;
      case "send_email":
      case "create_subitem_by_email":
        break;
      default:
        return { ok: false, error: `AI returned an unsupported action type "${String(a.type)}".` };
    }
  }

  return { ok: true, workflow: { name, trigger: t, action: action as Record<string, unknown> } };
}
