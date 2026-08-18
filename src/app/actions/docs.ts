"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor, requireUser, requireBoardEditor, requireBoardAccessAsUser } from "@/lib/guard";
import {
  generateDocumentCore,
  generateDocumentCoreDetailed,
  renderTemplatePreview,
  type GenerateResult,
  type PreviewResult,
} from "@/lib/generate-doc";
import { putFile, deleteFile } from "@/lib/blob-storage";
import { extractPlaceholders } from "@/lib/docx-fill";
import { buildPlaceholderList, resolveColumnBySlug, type PlaceholderRow } from "@/lib/placeholders";
import { cloudconvertConfigured } from "@/lib/cloudconvert";

// ── Templates ─────────────────────────────────────────────────
export async function createTemplate(boardId: string, name: string, body: string) {
  await requireBoardEditor(boardId);
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
  await requireBoardEditor(boardId);
  await db.docTemplate.updateMany({ where: { id, boardId }, data: { name: name.trim(), body } });
  revalidatePath(`/boards/${boardId}`);
}

export async function deleteTemplate(boardId: string, id: string) {
  await requireBoardEditor(boardId);
  const t = await db.docTemplate.findFirst({ where: { id, boardId }, select: { docxUrl: true } });
  if (!t) return;
  if (t.docxUrl) await deleteFile(t.docxUrl);
  await db.docTemplate.delete({ where: { id } });
  revalidatePath(`/boards/${boardId}`);
}

// ── DocuGen (.docx) templates ─────────────────────────────────
export type DocuGenTemplate = {
  id: string;
  name: string;
  kind: string;
  reference: string;
  viewName: string;
  employer: string;
  category: string;
  folder: string;
  docxName: string;
  docxUrl: string;
  placeholders: string[];
  mapping: Record<string, string>;
  hasSubitemsLoop: boolean;
  subitemColumns: string[];
  hasItemTableLoop: boolean;
  itemTableColumns: string[];
  outputFormat: string;
  outputColumnId: string | null;
  active: boolean;
  version: number;
  usageCount: number;
  usingAutomations: { id: string; name: string }[];
  createdAt: string;
};
export type DocuGenData = {
  templates: DocuGenTemplate[];
  columns: { id: string; name: string; type: string }[];
  fileColumns: { id: string; name: string }[];
};

function jsonArr(s: string): string[] {
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; }
}
function jsonObj(s: string): Record<string, string> {
  try { const o = JSON.parse(s); return o && typeof o === "object" ? o : {}; } catch { return {}; }
}

// Which automations on the board reference each templateId, by name — the
// data behind DocuGen's "Automation" section (client requirement: see which
// automations use this template, matching the reference app's menu).
async function templateUsage(boardId: string): Promise<Map<string, { id: string; name: string }[]>> {
  const autos = await db.automation.findMany({ where: { boardId }, select: { id: true, name: true, action: true } });
  const usage = new Map<string, { id: string; name: string }[]>();
  for (const a of autos) {
    let parsed: unknown;
    try { parsed = JSON.parse(a.action); } catch { continue; }
    const list = Array.isArray((parsed as { actions?: unknown[] })?.actions)
      ? (parsed as { actions: unknown[] }).actions
      : [parsed];
    for (const act of list) {
      const o = act as { type?: string; templateId?: string };
      if (o?.type === "generate_document" && o.templateId) {
        const list = usage.get(o.templateId) ?? [];
        list.push({ id: a.id, name: a.name });
        usage.set(o.templateId, list);
      }
    }
  }
  return usage;
}

export async function getDocuGenData(boardId: string): Promise<DocuGenData> {
  await requireBoardAccessAsUser(boardId);
  const [templates, board, usage] = await Promise.all([
    db.docTemplate.findMany({ where: { boardId }, orderBy: [{ folder: "asc" }, { name: "asc" }] }),
    db.board.findUnique({ where: { id: boardId }, include: { columns: { orderBy: { position: "asc" } } } }),
    templateUsage(boardId),
  ]);
  const columns = (board?.columns ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type }));
  return {
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      reference: t.reference,
      viewName: t.viewName,
      employer: t.employer,
      category: t.category,
      folder: t.folder,
      docxName: t.docxName,
      docxUrl: t.docxUrl,
      placeholders: jsonArr(t.placeholders),
      mapping: jsonObj(t.mapping),
      hasSubitemsLoop: t.hasSubitemsLoop,
      subitemColumns: jsonArr(t.subitemColumns),
      hasItemTableLoop: t.hasItemTableLoop,
      itemTableColumns: jsonArr(t.itemTableColumns),
      outputFormat: t.outputFormat,
      outputColumnId: t.outputColumnId,
      active: t.active,
      version: t.version,
      usageCount: (usage.get(t.id) ?? []).length,
      usingAutomations: usage.get(t.id) ?? [],
      createdAt: t.createdAt.toISOString(),
    })),
    columns,
    fileColumns: columns.filter((c) => c.type === "file"),
  };
}

export type BoardItemLite = { id: string; name: string };

// Lightweight item list for the template preview picker — "preview this
// template using data from item X." Fetched on demand (not part of
// getDocuGenData) so large boards don't pay for it unless Preview is opened.
export async function getBoardItemsLite(boardId: string): Promise<BoardItemLite[]> {
  await requireBoardAccessAsUser(boardId);
  return db.item.findMany({
    where: { boardId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

// Dynamic placeholder reference (Improvement 2) — Board Column | Placeholder
// list for the DocuGen configuration UI. Uses buildPlaceholderList(), the
// SAME function the fill engine's slug fallback resolves against
// (see generate-doc.ts), so every row shown here is guaranteed fillable.
export async function getPlaceholderList(boardId: string): Promise<PlaceholderRow[]> {
  await requireBoardAccessAsUser(boardId);
  const board = await db.board.findUnique({
    where: { id: boardId },
    include: { columns: { orderBy: { position: "asc" } } },
  });
  if (!board) return [];
  return buildPlaceholderList(board.columns.map((c) => ({ id: c.id, name: c.name, type: c.type })));
}

// Next stable reference like DG-001 for a board.
async function nextReference(boardId: string): Promise<string> {
  const existing = await db.docTemplate.findMany({ where: { boardId }, select: { reference: true } });
  let max = 0;
  for (const e of existing) {
    const m = /^DG-(\d+)$/.exec(e.reference);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `DG-${String(max + 1).padStart(3, "0")}`;
}

function bufFromDataUrl(dataUrl: string): Buffer {
  const i = dataUrl.indexOf(",");
  return Buffer.from(i >= 0 ? dataUrl.slice(i + 1) : dataUrl, "base64");
}

export type UploadResult = { ok: boolean; id?: string; reference?: string; placeholders?: string[]; duplicateOf?: string; error?: string };

// Upload a .docx template: store the file, auto-detect placeholders, create row.
export async function uploadDocxTemplate(
  boardId: string,
  input: { name: string; fileName: string; dataUrl: string }
): Promise<UploadResult> {
  await requireBoardEditor(boardId);
  if (!/\.docx$/i.test(input.fileName)) return { ok: false, error: "Please upload a .docx file." };
  let buf: Buffer;
  try { buf = bufFromDataUrl(input.dataUrl); } catch { return { ok: false, error: "Could not read the file." }; }
  if (buf.length > 15 * 1024 * 1024) return { ok: false, error: "Template is over 15 MB." };

  let placeholders: string[] = [];
  let hasSubitemsLoop = false;
  let hasItemTableLoop = false;
  try {
    const detected = extractPlaceholders(buf);
    if (detected.error) return { ok: false, error: detected.error };
    placeholders = detected.placeholders;
    hasSubitemsLoop = detected.hasSubitemsLoop;
    hasItemTableLoop = detected.hasItemTableLoop;
  } catch {
    return { ok: false, error: "That doesn't look like a valid .docx file." };
  }

  // Duplicate detection — same filename already on this board.
  const dup = await db.docTemplate.findFirst({ where: { boardId, docxName: input.fileName }, select: { id: true } });

  const url = await putFile(`templates/${boardId}/${input.fileName}`, buf, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const reference = await nextReference(boardId);
  // Auto-map placeholders whose name matches a column name (case-insensitive,
  // underscore-tolerant), falling back to a slug match (Improvement 2) — the
  // same slug the fill engine's own fallback uses — so a placeholder typed
  // straight from the reference list (e.g. {{first_name}}) auto-maps too.
  const board = await db.board.findUnique({ where: { id: boardId }, include: { columns: true } });
  const mapping: Record<string, string> = {};
  for (const p of placeholders) {
    const col =
      board?.columns.find(
        (c) => c.name.toLowerCase() === p.replace(/_/g, " ").toLowerCase() || c.name.toLowerCase() === p.toLowerCase()
      ) ?? resolveColumnBySlug(p, board?.columns ?? []);
    if (col) mapping[p] = col.name;
  }

  const t = await db.docTemplate.create({
    data: {
      boardId,
      name: input.name.trim() || input.fileName.replace(/\.docx$/i, ""),
      kind: "docx",
      reference,
      docxUrl: url,
      docxName: input.fileName,
      placeholders: JSON.stringify(placeholders),
      mapping: JSON.stringify(mapping),
      hasSubitemsLoop,
      hasItemTableLoop,
      outputFormat: "docx",
      active: true,
      version: 1,
    },
  });
  revalidatePath(`/boards/${boardId}`);
  return { ok: true, id: t.id, reference, placeholders, duplicateOf: dup?.id };
}

// Update metadata / mapping / output settings (name/ref/view/employer/etc.).
export async function saveTemplateMeta(
  boardId: string,
  id: string,
  patch: Partial<{
    name: string; viewName: string; reference: string; employer: string;
    category: string; folder: string; mapping: Record<string, string>;
    subitemColumns: string[]; itemTableColumns: string[];
    outputFormat: string; outputColumnId: string | null;
  }>
): Promise<void> {
  await requireBoardEditor(boardId);
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name.trim() || "Untitled template";
  if (patch.viewName !== undefined) data.viewName = patch.viewName.trim();
  if (patch.reference !== undefined) data.reference = patch.reference.trim();
  if (patch.employer !== undefined) data.employer = patch.employer.trim();
  if (patch.category !== undefined) data.category = patch.category.trim();
  if (patch.folder !== undefined) data.folder = patch.folder.trim();
  if (patch.mapping !== undefined) data.mapping = JSON.stringify(patch.mapping);
  if (patch.subitemColumns !== undefined) data.subitemColumns = JSON.stringify(patch.subitemColumns);
  if (patch.itemTableColumns !== undefined) data.itemTableColumns = JSON.stringify(patch.itemTableColumns);
  if (patch.outputFormat !== undefined) data.outputFormat = patch.outputFormat;
  if (patch.outputColumnId !== undefined) data.outputColumnId = patch.outputColumnId;
  await db.docTemplate.updateMany({ where: { id, boardId }, data });
  revalidatePath(`/boards/${boardId}`);
}

// Replace the .docx file (version control): snapshot current → new version.
export async function replaceTemplateFile(
  boardId: string,
  id: string,
  input: { fileName: string; dataUrl: string; note?: string }
): Promise<UploadResult> {
  await requireBoardEditor(boardId);
  if (!/\.docx$/i.test(input.fileName)) return { ok: false, error: "Please upload a .docx file." };
  const cur = await db.docTemplate.findFirst({ where: { id, boardId } });
  if (!cur) return { ok: false, error: "Template not found." };
  let buf: Buffer;
  try { buf = bufFromDataUrl(input.dataUrl); } catch { return { ok: false, error: "Could not read the file." }; }
  let placeholders: string[] = [];
  let hasSubitemsLoop = false;
  let hasItemTableLoop = false;
  try {
    const detected = extractPlaceholders(buf);
    if (detected.error) return { ok: false, error: detected.error };
    placeholders = detected.placeholders;
    hasSubitemsLoop = detected.hasSubitemsLoop;
    hasItemTableLoop = detected.hasItemTableLoop;
  } catch {
    return { ok: false, error: "Invalid .docx file." };
  }

  // Snapshot the current version.
  await db.docTemplateVersion.create({
    data: { templateId: id, version: cur.version, docxUrl: cur.docxUrl, docxName: cur.docxName, mapping: cur.mapping, note: input.note ?? "" },
  });
  const url = await putFile(`templates/${boardId}/${input.fileName}`, buf, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  await db.docTemplate.update({
    where: { id },
    data: { docxUrl: url, docxName: input.fileName, placeholders: JSON.stringify(placeholders), hasSubitemsLoop, hasItemTableLoop, version: cur.version + 1 },
  });
  revalidatePath(`/boards/${boardId}`);
  return { ok: true, id, placeholders };
}

export async function duplicateTemplate(boardId: string, id: string): Promise<void> {
  await requireBoardEditor(boardId);
  const t = await db.docTemplate.findFirst({ where: { id, boardId } });
  if (!t) return;
  const reference = await nextReference(boardId);
  await db.docTemplate.create({
    data: {
      boardId,
      name: `${t.name} (copy)`,
      kind: t.kind,
      body: t.body,
      reference,
      viewName: t.viewName,
      employer: t.employer,
      category: t.category,
      folder: t.folder,
      docxUrl: t.docxUrl,
      docxName: t.docxName,
      placeholders: t.placeholders,
      mapping: t.mapping,
      hasSubitemsLoop: t.hasSubitemsLoop,
      subitemColumns: t.subitemColumns,
      hasItemTableLoop: t.hasItemTableLoop,
      itemTableColumns: t.itemTableColumns,
      outputFormat: t.outputFormat,
      outputColumnId: t.outputColumnId,
      active: t.active,
      version: 1,
    },
  });
  revalidatePath(`/boards/${boardId}`);
}

export async function setTemplatesActive(boardId: string, ids: string[], active: boolean): Promise<void> {
  await requireBoardEditor(boardId);
  if (ids.length === 0) return;
  await db.docTemplate.updateMany({ where: { id: { in: ids }, boardId }, data: { active } });
  revalidatePath(`/boards/${boardId}`);
}

// ── Generate ──────────────────────────────────────────────────
export type DocRow = { id: string; name: string; createdAt: string };

export async function getItemDocs(boardId: string, itemId: string): Promise<DocRow[]> {
  await requireBoardAccessAsUser(boardId);
  const docs = await db.generatedDocument.findMany({
    where: { itemId, item: { boardId } },
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
  await requireBoardEditor(boardId);
  const id = await generateDocumentCore(itemId, templateId);
  revalidatePath(`/boards/${boardId}`);
  return id;
}

// Richer variant surfacing conversion errors (e.g. PDF not configured or
// CloudConvert failed) to the UI instead of a bare null.
export async function generateDocumentDetailed(
  boardId: string,
  itemId: string,
  templateId: string
): Promise<GenerateResult> {
  await requireBoardEditor(boardId);
  const result = await generateDocumentCoreDetailed(itemId, templateId);
  revalidatePath(`/boards/${boardId}`);
  return result;
}

// Whether visual preview / real PDF conversion is available at all — lets
// the UI show a clear "not configured" state instead of a confusing error
// only after the user clicks Preview.
export async function docuGenConversionAvailable(): Promise<boolean> {
  await requireUser();
  return cloudconvertConfigured();
}

// Visual preview (Improvement 1/2 follow-up from the client walkthrough):
// render a filled .docx template as a real PDF for a chosen item, without
// creating a GeneratedDocument row. Read access only (viewers can preview),
// but still board-scoped so a caller can't preview a template/item pair
// from a board they don't have access to.
export async function previewTemplate(
  boardId: string,
  itemId: string,
  templateId: string
): Promise<PreviewResult> {
  await requireBoardAccessAsUser(boardId);
  const [template, item] = await Promise.all([
    db.docTemplate.findFirst({ where: { id: templateId, boardId }, select: { id: true } }),
    db.item.findFirst({ where: { id: itemId, boardId }, select: { id: true } }),
  ]);
  if (!template) return { ok: false, error: "Template not found on this board." };
  if (!item) return { ok: false, error: "Item not found on this board." };
  return renderTemplatePreview(itemId, templateId);
}

export async function deleteDocument(boardId: string, id: string) {
  await requireBoardEditor(boardId);
  await db.generatedDocument.deleteMany({ where: { id, item: { boardId } } });
  revalidatePath(`/boards/${boardId}`);
}

// Send a generated document to the candidate for e-signature (DocuSign).
// Uses the org's connected DocuSign account; anchor tabs come from the
// {{Signature_N}} placeholders kept literal in the generated .docx.
export async function sendDocForSignature(docId: string): Promise<string> {
  const user = await requireEditor();
  const { getDsAccount, sendEnvelopeFromDocument, docusignConfigured } = await import("@/lib/docusign");
  const { fetchFileBuffer } = await import("@/lib/blob-storage");
  if (!docusignConfigured()) return "DocuSign not configured — add keys in Settings.";
  const account = await getDsAccount(user.orgId);
  if (!account) return "DocuSign not connected — connect it in Settings.";

  const doc = await db.generatedDocument.findUnique({
    where: { id: docId },
    include: { item: { include: { cells: { include: { column: true } }, board: true } } },
  });
  if (!doc) return "Document not found.";
  if (doc.item.board.environmentId && doc.item.board) {
    // org scope check
    const board = await db.board.findUnique({ where: { id: doc.item.boardId }, include: { environment: true } });
    if (board && board.environment.orgId !== user.orgId) return "Not found.";
  }
  const emailCell = doc.item.cells.find((c) => c.column.type === "email");
  const recipientEmail = emailCell?.value ?? "";
  if (!recipientEmail) return "No recipient email on this item.";

  // Only .docx generated documents carry a file to send.
  let fileUrl = "";
  try {
    const meta = JSON.parse(doc.content) as { fileUrl?: string };
    fileUrl = meta.fileUrl ?? "";
  } catch {}
  if (!fileUrl) return "This document has no downloadable file to send (regenerate as a .docx template).";

  let base64: string;
  try {
    base64 = (await fetchFileBuffer(fileUrl)).toString("base64");
  } catch {
    return "Could not read the generated document file.";
  }

  const res = await sendEnvelopeFromDocument(user.orgId, {
    documentBase64: base64,
    documentName: `${doc.name}.docx`,
    fileExtension: "docx",
    recipients: [{ email: recipientEmail, name: doc.item.name }],
    subject: doc.name,
  });
  if (!res.ok) return res.error ?? "Could not send.";

  await db.docuSignEnvelope.create({
    data: {
      orgId: user.orgId,
      itemId: doc.itemId,
      boardId: doc.item.boardId,
      envelopeId: res.envelopeId ?? "",
      status: "sent",
      recipientEmail,
      recipientName: doc.item.name,
      subject: doc.name,
    },
  });
  revalidatePath(`/boards/${doc.item.boardId}`);
  return "Sent for signature via DocuSign.";
}

// ── DocuSign account + templates (for Settings + automation builder) ──────────
export async function getDocuSignStatus(): Promise<{ configured: boolean; connected: boolean; accountName: string; email: string }> {
  const user = await requireUser();
  const { docusignConfigured } = await import("@/lib/docusign");
  const acct = await db.connectedDocuSignAccount.findUnique({
    where: { orgId: user.orgId },
    select: { accountName: true, email: true },
  });
  return { configured: docusignConfigured(), connected: !!acct, accountName: acct?.accountName ?? "", email: acct?.email ?? "" };
}

export async function disconnectDocuSign(): Promise<void> {
  const { requireAdmin } = await import("@/lib/guard");
  const admin = await requireAdmin();
  await db.connectedDocuSignAccount.deleteMany({ where: { orgId: admin.orgId } });
}

export type DsTemplateRow = { templateId: string; name: string };
export async function listDocuSignTemplates(): Promise<DsTemplateRow[]> {
  const user = await requireUser();
  const { listTemplates } = await import("@/lib/docusign");
  return listTemplates(user.orgId);
}

// Manually refresh an item's DocuSign envelope statuses (also pulls signed file).
export async function refreshEnvelopes(boardId: string, itemId: string): Promise<void> {
  const user = await requireBoardEditor(boardId);
  const { syncEnvelope } = await import("@/lib/docusign-sync");
  const envs = await db.docuSignEnvelope.findMany({ where: { itemId, orgId: user.orgId, envelopeId: { not: "" } } });
  for (const e of envs) await syncEnvelope(e.id);
  revalidatePath(`/boards/${boardId}`);
}

export type EnvelopeRow = {
  id: string;
  status: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  signedFileUrl: string;
  createdAt: string;
};
// E-signature envelopes tracked for an item (for the item drawer).
export async function getItemEnvelopes(itemId: string): Promise<EnvelopeRow[]> {
  const user = await requireUser();
  const rows = await db.docuSignEnvelope.findMany({
    where: { itemId, orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, recipientEmail: true, recipientName: true, subject: true, signedFileUrl: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
