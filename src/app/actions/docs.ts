"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor, requireUser } from "@/lib/guard";
import { generateDocumentCore } from "@/lib/generate-doc";

// ── Templates ─────────────────────────────────────────────────
export async function createTemplate(boardId: string, name: string, body: string) {
  await requireEditor();
  await db.docTemplate.create({
    data: { boardId, name: name.trim() || "Untitled template", body },
  });
  revalidatePath(`/boards/${boardId}`);
}

export async function updateTemplate(
  boardId: string,
  id: string,
  name: string,
  body: string
) {
  await requireEditor();
  await db.docTemplate.update({ where: { id }, data: { name: name.trim(), body } });
  revalidatePath(`/boards/${boardId}`);
}

export async function deleteTemplate(boardId: string, id: string) {
  await requireEditor();
  await db.docTemplate.delete({ where: { id } });
  revalidatePath(`/boards/${boardId}`);
}

// ── Generate ──────────────────────────────────────────────────
export type DocRow = { id: string; name: string; createdAt: string };

export async function getItemDocs(itemId: string): Promise<DocRow[]> {
  await requireUser();
  const docs = await db.generatedDocument.findMany({
    where: { itemId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true },
  });
  return docs.map((d) => ({ id: d.id, name: d.name, createdAt: d.createdAt.toISOString() }));
}

export async function generateDocument(
  boardId: string,
  itemId: string,
  templateId: string
): Promise<string | null> {
  await requireEditor();
  const id = await generateDocumentCore(itemId, templateId);
  revalidatePath(`/boards/${boardId}`);
  return id;
}

export async function deleteDocument(boardId: string, id: string) {
  await requireEditor();
  await db.generatedDocument.delete({ where: { id } });
  revalidatePath(`/boards/${boardId}`);
}

// Send a generated document to the candidate for e-signature (DocuSign).
// Returns a short status string for UI feedback (no-op until keys are set).
export async function sendDocForSignature(docId: string): Promise<string> {
  await requireEditor();
  const { sendForSignature } = await import("@/lib/docusign");
  const doc = await db.generatedDocument.findUnique({
    where: { id: docId },
    include: { item: { include: { cells: { include: { column: true } } } } },
  });
  if (!doc) return "Document not found.";
  const emailCell = doc.item.cells.find((c) => c.column.type === "email");
  const res = await sendForSignature({
    documentHtml: doc.html,
    documentName: doc.name,
    recipientEmail: emailCell?.value ?? "",
    recipientName: doc.item.name,
  });
  if (res.ok) return "Sent for signature.";
  if (res.skipped) return "DocuSign not configured — add keys in Integrations.";
  return res.error ?? "Could not send.";
}
