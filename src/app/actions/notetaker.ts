"use server";

import { db } from "@/lib/db";
import { requireUser, requireBoardAccessAsUser } from "@/lib/guard";
import { aiConfigured, askClaudeForJson } from "@/lib/ai/claude";
import { transcriptionConfigured, transcribeAudio } from "@/lib/ai/transcription";

export async function getNotetakerStatus(): Promise<{ summarizeConfigured: boolean; audioConfigured: boolean }> {
  await requireUser();
  return { summarizeConfigured: aiConfigured(), audioConfigured: transcriptionConfigured() };
}

export type NotetakerSessionRow = {
  id: string;
  title: string;
  sourceKind: string;
  rawText: string;
  summary: string;
  actionItems: string[];
  status: string;
  error: string;
  itemId: string | null;
  createdAt: string;
};

function toRow(r: {
  id: string; title: string; sourceKind: string; rawText: string; summary: string;
  actionItems: string; status: string; error: string; itemId: string | null; createdAt: Date;
}): NotetakerSessionRow {
  return {
    id: r.id, title: r.title, sourceKind: r.sourceKind, rawText: r.rawText, summary: r.summary,
    actionItems: JSON.parse(r.actionItems || "[]"), status: r.status, error: r.error,
    itemId: r.itemId, createdAt: r.createdAt.toISOString(),
  };
}

export async function listNotetakerSessions(): Promise<NotetakerSessionRow[]> {
  const user = await requireUser();
  const rows = await db.notetakerSession.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map(toRow);
}

async function summarize(text: string): Promise<{ summary: string; actionItems: string[] } | { error: string }> {
  const system = `You summarize meeting notes/transcripts. Respond with ONLY strict JSON: {"summary": "2-4 sentence summary", "actionItems": ["short action item", ...]}. If there are no clear action items, return an empty array.`;
  const result = await askClaudeForJson(system, text.slice(0, 12000), 800);
  if (!result.ok) return { error: result.error };
  const d = result.data as Record<string, unknown>;
  return {
    summary: typeof d.summary === "string" ? d.summary : "",
    actionItems: Array.isArray(d.actionItems) ? d.actionItems.filter((x): x is string => typeof x === "string") : [],
  };
}

// Text-paste path — no OPENAI_API_KEY needed, works as soon as
// ANTHROPIC_API_KEY is set.
export async function createTextNoteSession(title: string, text: string, itemId?: string): Promise<NotetakerSessionRow> {
  const user = await requireUser();
  if (itemId) {
    const item = await db.item.findFirst({ where: { id: itemId }, select: { boardId: true } });
    if (item) await requireBoardAccessAsUser(item.boardId);
  }
  if (!text.trim()) throw new Error("Paste some notes first.");

  const result = await summarize(text);
  if ("error" in result) {
    const row = await db.notetakerSession.create({
      data: { orgId: user.orgId, itemId: itemId || null, createdById: user.id, title: title.trim() || "Untitled session", sourceKind: "text", rawText: text, status: "failed", error: result.error },
    });
    return toRow(row);
  }
  const row = await db.notetakerSession.create({
    data: {
      orgId: user.orgId, itemId: itemId || null, createdById: user.id,
      title: title.trim() || "Untitled session", sourceKind: "text", rawText: text,
      summary: result.summary, actionItems: JSON.stringify(result.actionItems), status: "done",
    },
  });
  if (itemId) {
    await db.update.create({ data: { itemId, body: `📝 Notetaker summary: ${result.summary}`, mentions: "[]" } }).catch(() => {});
  }
  return toRow(row);
}

// Audio path — requires OPENAI_API_KEY for Whisper transcription; the
// summarization step reuses the same Claude call as the text path.
export async function createAudioNoteSession(title: string, base64Audio: string, filename: string, mimeType: string, itemId?: string): Promise<NotetakerSessionRow> {
  const user = await requireUser();
  if (itemId) {
    const item = await db.item.findFirst({ where: { id: itemId }, select: { boardId: true } });
    if (item) await requireBoardAccessAsUser(item.boardId);
  }
  if (!transcriptionConfigured()) throw new Error("Audio transcription is not configured — add OPENAI_API_KEY.");

  const { putFile } = await import("@/lib/blob-storage");
  const buf = Buffer.from(base64Audio, "base64");
  const audioUrl = await putFile(`notetaker/${Date.now()}-${filename}`, buf, mimeType);

  const row0 = await db.notetakerSession.create({
    data: { orgId: user.orgId, itemId: itemId || null, createdById: user.id, title: title.trim() || "Untitled session", sourceKind: "audio", audioUrl, audioName: filename, status: "transcribing" },
  });

  const transcript = await transcribeAudio(buf, filename, mimeType);
  if (!transcript.ok) {
    const row = await db.notetakerSession.update({ where: { id: row0.id }, data: { status: "failed", error: transcript.error } });
    return toRow(row);
  }

  const result = await summarize(transcript.text);
  if ("error" in result) {
    const row = await db.notetakerSession.update({ where: { id: row0.id }, data: { rawText: transcript.text, status: "failed", error: result.error } });
    return toRow(row);
  }
  const row = await db.notetakerSession.update({
    where: { id: row0.id },
    data: { rawText: transcript.text, summary: result.summary, actionItems: JSON.stringify(result.actionItems), status: "done" },
  });
  if (itemId) {
    await db.update.create({ data: { itemId, body: `📝 Notetaker summary: ${result.summary}`, mentions: "[]" } }).catch(() => {});
  }
  return toRow(row);
}

export async function deleteNoteSession(id: string): Promise<void> {
  const user = await requireUser();
  await db.notetakerSession.deleteMany({ where: { id, orgId: user.orgId } });
}
