import "server-only";
import { db } from "@/lib/db";
import { getEnvelopeStatus, downloadSignedPdf } from "@/lib/docusign";
import { putFile } from "@/lib/blob-storage";
import { parseFileValue, type FileValue } from "@/lib/cell-values";
import type { StatusLabel } from "@/lib/constants";

// Write a status string into a board column. For a status column we match a
// label by text; for text columns we write the string; otherwise no-op.
async function writeStatus(itemId: string, columnId: string, status: string) {
  const col = await db.column.findUnique({ where: { id: columnId }, select: { type: true, config: true } });
  if (!col) return;
  let value: string | null = null;
  if (col.type === "status") {
    try {
      const labels: StatusLabel[] = JSON.parse(col.config).labels ?? [];
      const lab = labels.find((l) => l.label.toLowerCase() === status.toLowerCase());
      value = lab?.id ?? null;
    } catch {
      value = null;
    }
    if (!value) return; // no matching label — leave as is
  } else {
    value = status;
  }
  await db.cell.upsert({
    where: { itemId_columnId: { itemId, columnId } },
    create: { itemId, columnId, value },
    update: { value },
  });
}

async function appendFile(itemId: string, columnId: string, file: FileValue) {
  const existing = await db.cell.findUnique({ where: { itemId_columnId: { itemId, columnId } }, select: { value: true } });
  const list = parseFileValue(existing?.value).filter((f) => f.url.startsWith("http") || f.url.startsWith("data:"));
  const next = JSON.stringify([...list, file]);
  await db.cell.upsert({
    where: { itemId_columnId: { itemId, columnId } },
    create: { itemId, columnId, value: next },
    update: { value: next },
  });
}

// Pull the current status for one tracked envelope; write it to the board and,
// once signed, upload the completed PDF to the signed file column.
export async function syncEnvelope(id: string): Promise<void> {
  const env = await db.docuSignEnvelope.findUnique({ where: { id } });
  if (!env || !env.envelopeId) return;
  const status = await getEnvelopeStatus(env.orgId, env.envelopeId);
  if (!status) return;

  const patch: { status?: string; signedFileUrl?: string } = {};
  if (status !== env.status) patch.status = status;
  if (env.statusColumnId) await writeStatus(env.itemId, env.statusColumnId, status);

  if (status === "signed" && env.signedColumnId && !env.signedFileUrl) {
    const pdf = await downloadSignedPdf(env.orgId, env.envelopeId);
    if (pdf) {
      const url = await putFile(`signed/${env.itemId}/${env.envelopeId}.pdf`, pdf, "application/pdf");
      patch.signedFileUrl = url;
      await appendFile(env.itemId, env.signedColumnId, {
        name: `${(env.subject || "Signed").replace(/[^\w.-]+/g, "_")}.pdf`,
        type: "application/pdf",
        url,
      });
    }
  }
  if (Object.keys(patch).length) await db.docuSignEnvelope.update({ where: { id }, data: patch });
}

// Sync by DocuSign envelopeId (used by the Connect webhook).
export async function syncByEnvelopeId(envelopeId: string): Promise<void> {
  const envs = await db.docuSignEnvelope.findMany({ where: { envelopeId } });
  for (const e of envs) await syncEnvelope(e.id);
}
