import "server-only";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Placeholder delimiters used in .docx templates: {{Candidate_Name}} etc.
const DELIMS = { start: "{{", end: "}}" };

// Detect the {{Placeholders}} used in an uploaded .docx (body + headers/footers).
// Strips XML tags first so tags split across runs are still detected.
export function extractPlaceholders(templateBuf: Buffer): string[] {
  const zip = new PizZip(templateBuf);
  const names = new Set<string>();
  for (const f of Object.keys(zip.files)) {
    if (!/word\/(document|header\d*|footer\d*)\.xml$/.test(f)) continue;
    const xml = zip.files[f].asText();
    const text = xml.replace(/<[^>]+>/g, "");
    for (const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      const name = m[1].trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}

// Fill an uploaded .docx template with a flat data map and return the DOCX bytes.
export function fillDocx(templateBuf: Buffer, data: Record<string, string>): Buffer {
  const zip = new PizZip(templateBuf);
  const doc = new Docxtemplater(zip, {
    delimiters: DELIMS,
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}
