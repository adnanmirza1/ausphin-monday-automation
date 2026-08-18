"use server";

import { db } from "@/lib/db";
import { requireBoardAccessAsUser } from "@/lib/guard";
import { aiConfigured, askClaude } from "@/lib/ai/claude";

export async function getSidekickStatus(): Promise<{ configured: boolean }> {
  return { configured: aiConfigured() };
}

// Stateless Q&A grounded in one item's real data — no chat history persisted
// (Sidekick is a quick in-context helper, not a saved conversation feature).
// Never invents data: the item's actual field values are given to the model
// as context, and the prompt instructs it to say so plainly if something
// isn't in that context rather than guessing.
export async function askSidekick(boardId: string, itemId: string, question: string): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  await requireBoardAccessAsUser(boardId);
  if (!question.trim()) return { ok: false, error: "Ask a question first." };

  const item = await db.item.findFirst({
    where: { id: itemId, boardId },
    include: {
      board: true,
      cells: { include: { column: true, person: true } },
      updates: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!item) return { ok: false, error: "Item not found." };

  const fields = item.cells
    .map((c) => {
      let v = c.value ?? "";
      if (c.column.type === "status") {
        try {
          v = (JSON.parse(c.column.config).labels ?? []).find((l: { id: string }) => l.id === c.value)?.label ?? "";
        } catch {}
      } else if (c.column.type === "person") v = c.person?.name ?? "";
      return `${c.column.name}: ${v || "(empty)"}`;
    })
    .join("\n");
  const recentUpdates = item.updates.map((u) => `- ${u.body}`).join("\n") || "(none)";

  const system = `You are an in-context assistant inside a work-management app, helping with ONE item on the board "${item.board.name}".

Item: "${item.name}"
Fields:
${fields}

Recent updates:
${recentUpdates}

Answer the user's question using only this data. If the answer isn't in this data, say so plainly instead of guessing. Keep answers short and direct — a sentence or two, not an essay.`;

  const result = await askClaude(system, question.trim(), 512);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, answer: result.text };
}
