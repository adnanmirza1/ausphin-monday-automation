"use server";

import { db } from "@/lib/db";
import { requireUser, requireBoardAccessAsUser } from "@/lib/guard";
import { aiConfigured, askClaudeForJson } from "@/lib/ai/claude";

export async function getVibeStatus(): Promise<{ configured: boolean }> {
  await requireUser();
  return { configured: aiConfigured() };
}

export type SentimentRow = {
  id: string;
  itemId: string;
  itemName: string;
  boardId: string;
  boardName: string;
  sentiment: string;
  score: number;
  summary: string;
  flagged: boolean;
  status: string;
  error: string;
  createdAt: string;
};

// Recent flagged/negative items across the org — the "surfaced for
// follow-up" view Vibe's landing page shows.
export async function listFlaggedSentiment(limit = 25): Promise<SentimentRow[]> {
  const user = await requireUser();
  const { allowedBoardIds } = await import("@/lib/guard");
  const allowed = allowedBoardIds(user);
  const rows = await db.sentimentScore.findMany({
    where: {
      flagged: true,
      item: { board: { environment: { orgId: user.orgId }, ...(allowed ? { id: { in: allowed } } : {}) } },
    },
    include: { item: { include: { board: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
  return rows.map((r) => ({
    id: r.id,
    itemId: r.itemId,
    itemName: r.item.name,
    boardId: r.item.boardId,
    boardName: r.item.board.name,
    sentiment: r.sentiment,
    score: r.score,
    summary: r.summary,
    flagged: r.flagged,
    status: r.status,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getItemSentimentHistory(boardId: string, itemId: string): Promise<SentimentRow[]> {
  await requireBoardAccessAsUser(boardId);
  const rows = await db.sentimentScore.findMany({
    where: { itemId, item: { boardId } },
    include: { item: { include: { board: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.map((r) => ({
    id: r.id,
    itemId: r.itemId,
    itemName: r.item.name,
    boardId: r.item.boardId,
    boardName: r.item.board.name,
    sentiment: r.sentiment,
    score: r.score,
    summary: r.summary,
    flagged: r.flagged,
    status: r.status,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  }));
}

// Analyze one item's recent updates + emails and store a SentimentScore row.
// Real Claude call, never a mocked score — a run with nothing to analyze or
// an AI failure is recorded honestly as status "skipped"/"failed", same
// pattern as the automation engine's actions.
export async function analyzeItemSentiment(boardId: string, itemId: string): Promise<SentimentRow> {
  await requireBoardAccessAsUser(boardId);

  const item = await db.item.findFirst({
    where: { id: itemId, boardId },
    include: {
      board: true,
      updates: { orderBy: { createdAt: "desc" }, take: 15 },
      emails: { orderBy: { createdAt: "desc" }, take: 15 },
    },
  });
  if (!item) throw new Error("Item not found.");

  const updateText = item.updates.map((u) => u.body).join("\n---\n");
  const emailText = item.emails.map((e) => `${e.subject}\n${e.body}`).join("\n---\n");
  const combined = [updateText, emailText].filter(Boolean).join("\n---\n");

  if (!combined.trim()) {
    const row = await db.sentimentScore.create({
      data: { itemId, status: "skipped", error: "No updates or emails to analyze.", sourceKind: "both" },
    });
    return {
      id: row.id, itemId, itemName: item.name, boardId: item.boardId, boardName: item.board.name,
      sentiment: row.sentiment, score: row.score, summary: row.summary, flagged: row.flagged,
      status: row.status, error: row.error, createdAt: row.createdAt.toISOString(),
    };
  }

  const system = `You analyze the tone/sentiment of text from a work-management item's activity (updates and emails) and respond with ONLY strict JSON: {"sentiment": "positive"|"neutral"|"negative"|"mixed", "score": number between -1 and 1, "summary": "one sentence explaining why", "flagged": boolean}. Set flagged=true only when the tone suggests something needs human follow-up (frustration, complaint, urgent concern) — not for routine neutral/positive updates.`;

  const result = await askClaudeForJson(system, combined.slice(0, 8000));
  if (!result.ok) {
    const row = await db.sentimentScore.create({
      data: { itemId, status: "failed", error: result.error, sourceKind: "both" },
    });
    return {
      id: row.id, itemId, itemName: item.name, boardId: item.boardId, boardName: item.board.name,
      sentiment: row.sentiment, score: row.score, summary: row.summary, flagged: row.flagged,
      status: row.status, error: row.error, createdAt: row.createdAt.toISOString(),
    };
  }

  const d = result.data as Record<string, unknown>;
  const sentiment = ["positive", "neutral", "negative", "mixed"].includes(String(d.sentiment)) ? String(d.sentiment) : "neutral";
  const score = typeof d.score === "number" ? Math.max(-1, Math.min(1, d.score)) : 0;
  const summary = typeof d.summary === "string" ? d.summary.slice(0, 500) : "";
  const flagged = d.flagged === true;

  const row = await db.sentimentScore.create({
    data: { itemId, sentiment, score, summary, flagged, status: "ok", sourceKind: "both" },
  });
  return {
    id: row.id, itemId, itemName: item.name, boardId: item.boardId, boardName: item.board.name,
    sentiment: row.sentiment, score: row.score, summary: row.summary, flagged: row.flagged,
    status: row.status, error: row.error, createdAt: row.createdAt.toISOString(),
  };
}
