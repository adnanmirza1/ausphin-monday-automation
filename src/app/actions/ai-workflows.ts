"use server";

import { db } from "@/lib/db";
import { requireBoardEditor, requireUser } from "@/lib/guard";
import { aiConfigured, parseWorkflowPrompt, type ParseContext } from "@/lib/ai/workflow-parser";
import { createAutomation } from "@/app/actions/automation";

export async function getAiWorkflowsStatus(): Promise<{ configured: boolean }> {
  await requireUser();
  return { configured: aiConfigured() };
}

export type BoardOption = { id: string; name: string; environmentName: string };

// Boards the current user may create workflows on — reuses the same
// board-scope rules every other board-scoped action in this app enforces.
export async function listWorkflowBoards(): Promise<BoardOption[]> {
  const user = await requireUser();
  const { allowedBoardIds } = await import("@/lib/guard");
  const allowed = allowedBoardIds(user);
  const boards = await db.board.findMany({
    where: {
      environment: { orgId: user.orgId },
      archivedAt: null,
      ...(allowed ? { id: { in: allowed } } : {}),
    },
    include: { environment: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return boards.map((b) => ({ id: b.id, name: b.name, environmentName: b.environment.name }));
}

export type PreviewedWorkflow = {
  name: string;
  trigger: Record<string, unknown>;
  action: Record<string, unknown>;
};

// Parse a prompt into a previewable {trigger, action} pair WITHOUT saving —
// the builder shows this to the user before they commit it as a real
// automation (mirrors how every other builder flow in this app works: draft
// first, save on explicit action).
export async function previewAiWorkflow(
  boardId: string,
  prompt: string
): Promise<{ ok: true; workflow: PreviewedWorkflow } | { ok: false; error: string }> {
  await requireBoardEditor(boardId);

  const board = await db.board.findUnique({
    where: { id: boardId },
    include: {
      columns: { orderBy: { position: "asc" } },
      groups: { orderBy: { position: "asc" } },
      environment: { select: { orgId: true } },
      docTemplates: { where: { active: true } },
    },
  });
  if (!board) return { ok: false, error: "Board not found." };

  const departments = await db.department.findMany({ where: { orgId: board.environment.orgId }, orderBy: { name: "asc" } });
  const otherBoards = await db.board.findMany({
    where: { environment: { orgId: board.environment.orgId }, archivedAt: null, id: { not: boardId } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const ctx: ParseContext = {
    boardName: board.name,
    columns: board.columns.map((c) => {
      let labels: { id: string; label: string }[] | undefined;
      if (c.type === "status") {
        try {
          labels = JSON.parse(c.config).labels ?? [];
        } catch {
          labels = [];
        }
      }
      return { id: c.id, name: c.name, type: c.type, labels };
    }),
    groups: board.groups.map((g) => ({ id: g.id, name: g.name })),
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
    templates: board.docTemplates.map((t) => ({ id: t.id, name: t.name })),
    otherBoards,
  };

  const result = await parseWorkflowPrompt(prompt, ctx);
  if (!result.ok) return result;
  return { ok: true, workflow: result.workflow };
}

// Commit a previewed (or hand-edited) workflow as a real Automation row —
// reuses the existing createAutomation action so it shows up in the same
// automations panel/history as every manually-built rule.
export async function saveAiWorkflow(boardId: string, workflow: PreviewedWorkflow, folder = "AI Workflows"): Promise<void> {
  await requireBoardEditor(boardId);
  await createAutomation(boardId, { name: workflow.name, folder, trigger: workflow.trigger, action: workflow.action });
}
