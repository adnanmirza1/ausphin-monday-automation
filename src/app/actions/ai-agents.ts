"use server";

import { db } from "@/lib/db";
import { requireUser, requireAdmin, requireBoardAccessAsUser } from "@/lib/guard";
import { aiConfigured } from "@/lib/ai/claude";
import { planAgentSteps, executeAgentStep, type AgentStep } from "@/lib/ai/agent-runner";

export async function getAgentsStatus(): Promise<{ configured: boolean }> {
  await requireUser();
  return { configured: aiConfigured() };
}

// NOT exported directly — a "use server" file may only export async
// functions, so listAllowedToolTypes() below is the client-facing accessor.
const ALLOWED_TOOL_TYPES = [
  "move_to_group",
  "set_status",
  "change_column_value",
  "notify",
  "generate_document",
  "send_email",
] as const;

export type AgentRow = {
  id: string;
  name: string;
  goal: string;
  allowedTools: string[];
  requireApproval: boolean;
  status: string;
  createdAt: string;
};

export async function listAgents(): Promise<AgentRow[]> {
  const user = await requireUser();
  const rows = await db.agentDefinition.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    id: r.id, name: r.name, goal: r.goal,
    allowedTools: JSON.parse(r.allowedTools || "[]"),
    requireApproval: r.requireApproval, status: r.status, createdAt: r.createdAt.toISOString(),
  }));
}

export async function createAgent(name: string, goal: string, allowedTools: string[], requireApproval: boolean): Promise<AgentRow> {
  const admin = await requireAdmin();
  const validTools = allowedTools.filter((t) => (ALLOWED_TOOL_TYPES as readonly string[]).includes(t));
  const row = await db.agentDefinition.create({
    data: {
      orgId: admin.orgId,
      name: name.trim() || "Untitled agent",
      goal: goal.trim(),
      allowedTools: JSON.stringify(validTools),
      requireApproval,
      createdById: admin.id,
      status: "active",
    },
  });
  return {
    id: row.id, name: row.name, goal: row.goal, allowedTools: validTools,
    requireApproval: row.requireApproval, status: row.status, createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteAgent(agentId: string): Promise<void> {
  const admin = await requireAdmin();
  await db.agentDefinition.deleteMany({ where: { id: agentId, orgId: admin.orgId } });
}

export type AgentRunRow = {
  id: string;
  input: string;
  steps: AgentStep[];
  status: string;
  error: string;
  startedAt: string;
};

export async function listAgentRuns(agentId: string): Promise<AgentRunRow[]> {
  const user = await requireUser();
  const agent = await db.agentDefinition.findFirst({ where: { id: agentId, orgId: user.orgId } });
  if (!agent) return [];
  const runs = await db.agentRun.findMany({ where: { agentId }, orderBy: { startedAt: "desc" }, take: 25 });
  return runs.map((r) => ({
    id: r.id, input: r.input, steps: JSON.parse(r.steps || "[]"),
    status: r.status, error: r.error, startedAt: r.startedAt.toISOString(),
  }));
}

// Start a run: plan steps toward the agent's goal for this specific input,
// scoped to one board (so ids in the plan can be validated against real
// board data). Does NOT execute anything yet — steps sit "pending" until
// approved, unless requireApproval is off, in which case non-sensitive steps
// run immediately and only sensitive ones (see isSensitiveStep) still wait.
export async function startAgentRun(agentId: string, boardId: string, input: string): Promise<AgentRunRow> {
  const user = await requireBoardAccessAsUser(boardId);
  const agent = await db.agentDefinition.findFirst({ where: { id: agentId, orgId: user.orgId } });
  if (!agent) throw new Error("Agent not found.");

  const board = await db.board.findUnique({
    where: { id: boardId },
    include: { columns: { orderBy: { position: "asc" } }, groups: { orderBy: { position: "asc" } }, docTemplates: { where: { active: true } }, environment: true },
  });
  if (!board) throw new Error("Board not found.");
  const departments = await db.department.findMany({ where: { orgId: board.environment.orgId } });

  const run = await db.agentRun.create({ data: { agentId, input: input.trim(), status: "planning" } });

  const plan = await planAgentSteps(agent.goal, input, {
    boardName: board.name,
    columns: board.columns.map((c) => {
      let labels: { id: string; label: string }[] | undefined;
      if (c.type === "status") { try { labels = JSON.parse(c.config).labels ?? []; } catch { labels = []; } }
      return { id: c.id, name: c.name, type: c.type, labels };
    }),
    groups: board.groups.map((g) => ({ id: g.id, name: g.name })),
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    templates: board.docTemplates.map((t) => ({ id: t.id, name: t.name })),
    allowedTools: JSON.parse(agent.allowedTools || "[]"),
  });

  if (!plan.ok) {
    const updated = await db.agentRun.update({ where: { id: run.id }, data: { status: "failed", error: plan.error, finishedAt: new Date() } });
    return { id: updated.id, input: updated.input, steps: [], status: updated.status, error: updated.error, startedAt: updated.startedAt.toISOString() };
  }

  const status = plan.steps.length === 0 ? "completed" : agent.requireApproval ? "awaiting_approval" : "running";
  const updated = await db.agentRun.update({
    where: { id: run.id },
    data: { steps: JSON.stringify(plan.steps), status, finishedAt: status === "completed" ? new Date() : null },
  });
  return { id: updated.id, input: updated.input, steps: plan.steps, status: updated.status, error: updated.error, startedAt: updated.startedAt.toISOString() };
}

// Approve and execute one step (index into the run's steps array). itemId is
// supplied by the caller (the board item the run should act on) since a
// plan's steps don't carry one — this keeps "which item" an explicit,
// user-confirmed choice rather than something the model decided.
export async function approveAgentStep(runId: string, stepIndex: number, boardId: string, itemId: string): Promise<AgentRunRow> {
  await requireBoardAccessAsUser(boardId);
  const run = await db.agentRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error("Run not found.");
  const steps: AgentStep[] = JSON.parse(run.steps || "[]");
  if (!steps[stepIndex]) throw new Error("Step not found.");

  steps[stepIndex] = await executeAgentStep(boardId, itemId, steps[stepIndex]);
  const allSettled = steps.every((s) => s.status === "done" || s.status === "failed" || s.status === "skipped");
  const anyFailed = steps.some((s) => s.status === "failed");
  const status = allSettled ? (anyFailed ? "failed" : "completed") : "awaiting_approval";

  const updated = await db.agentRun.update({
    where: { id: runId },
    data: { steps: JSON.stringify(steps), status, finishedAt: allSettled ? new Date() : null },
  });
  return { id: updated.id, input: updated.input, steps, status: updated.status, error: updated.error, startedAt: updated.startedAt.toISOString() };
}

export async function listAllowedToolTypes(): Promise<string[]> {
  await requireUser();
  return [...ALLOWED_TOOL_TYPES];
}
