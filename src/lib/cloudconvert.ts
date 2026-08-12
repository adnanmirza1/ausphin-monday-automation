import "server-only";

// DOCX -> PDF conversion via CloudConvert's REST API (real LibreOffice/Office
// engine — preserves tables, styles, headers/footers, unlike pdf-lib which
// can only draw a PDF from scratch and cannot parse an existing .docx).
// Used by: DocuGen's "PDF" output format (generate-doc.ts) and the template
// preview action (docs.ts).
//
// Flow: create a job (import/upload -> convert -> export/url), upload the
// docx buffer to the signed upload URL the job returns, poll until done,
// then fetch the resulting PDF bytes. See CloudConvert's /v2/jobs API.

const API_BASE = "https://api.cloudconvert.com/v2";
const POLL_INTERVAL_MS = 1500;
const MAX_WAIT_MS = 45_000; // stay well under Vercel's function time limit

export function cloudconvertConfigured(): boolean {
  return !!process.env.CLOUDCONVERT_API_KEY;
}

type CcTask = {
  name: string;
  status: string;
  operation: string;
  result?: {
    form?: { url: string; parameters: Record<string, string> };
    files?: { url: string; filename?: string }[];
  };
  message?: string;
};
type CcJob = { id: string; status: string; tasks: CcTask[] };

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.CLOUDCONVERT_API_KEY}` };
}

async function createJob(): Promise<CcJob> {
  const res = await fetch(`${API_BASE}/jobs`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      tasks: {
        "upload-file": { operation: "import/upload" },
        "convert-file": {
          operation: "convert",
          input: "upload-file",
          input_format: "docx",
          output_format: "pdf",
          engine: "office",
        },
        "export-file": { operation: "export/url", input: "convert-file" },
      },
    }),
  });
  if (!res.ok) throw new Error(`CloudConvert: could not create job (${res.status}).`);
  const body = (await res.json()) as { data: CcJob };
  return body.data;
}

async function uploadFile(uploadTask: CcTask, buf: Buffer, fileName: string): Promise<void> {
  const form = uploadTask.result?.form;
  if (!form) throw new Error("CloudConvert: upload task returned no upload form.");
  const fd = new FormData();
  for (const [k, v] of Object.entries(form.parameters)) fd.append(k, v);
  fd.append("file", new Blob([new Uint8Array(buf)]), fileName);
  const res = await fetch(form.url, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`CloudConvert: file upload failed (${res.status}).`);
}

async function pollJob(jobId: string): Promise<CcJob> {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    const res = await fetch(`${API_BASE}/jobs/${jobId}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`CloudConvert: could not check job status (${res.status}).`);
    const body = (await res.json()) as { data: CcJob };
    const job = body.data;
    if (job.status === "finished") return job;
    if (job.status === "error") {
      const failed = job.tasks.find((t) => t.status === "error");
      throw new Error(`CloudConvert: conversion failed${failed?.message ? ` — ${failed.message}` : "."}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("CloudConvert: conversion timed out.");
}

// Convert a filled .docx Buffer to a PDF Buffer. Throws with a message safe
// to surface to the user (no raw stack traces / API internals leaked).
export async function convertDocxToPdf(buf: Buffer, fileName = "document.docx"): Promise<Buffer> {
  if (!cloudconvertConfigured()) {
    throw new Error("PDF conversion is not configured yet — add CLOUDCONVERT_API_KEY to enable it.");
  }
  const job = await createJob();
  const uploadTask = job.tasks.find((t) => t.name === "upload-file");
  if (!uploadTask) throw new Error("CloudConvert: job did not include an upload task.");
  await uploadFile(uploadTask, buf, fileName);

  const finished = await pollJob(job.id);
  const exportTask = finished.tasks.find((t) => t.name === "export-file");
  const fileUrl = exportTask?.result?.files?.[0]?.url;
  if (!fileUrl) throw new Error("CloudConvert: no output file returned.");

  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new Error(`CloudConvert: could not download converted PDF (${fileRes.status}).`);
  return Buffer.from(await fileRes.arrayBuffer());
}
