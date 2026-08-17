import "server-only";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Placeholder delimiters used in .docx templates: {{Candidate_Name}} etc.
const DELIMS = { start: "{{", end: "}}" };

// Reserved loop tag names. Docxtemplater's loop module keeps its own "#"/"/"
// prefix regardless of the {{ }} delimiter choice above (see docxtemplater's
// LoopModule), so the full tags in a template are literally "{{#tag}}" and
// "{{/tag}}".
//
// Subitem tables (client requirement): {{#subitems}} ... {{/subitems}} around
// a table row repeats that row once per subitem.
export const SUBITEMS_LOOP_TAG = "subitems";
// Item tables (client requirement): {{#item_fields}} ... {{/item_fields}}
// around a table row repeats that row once per SELECTED COLUMN of the
// current item — i.e. a Field | Value table (e.g. Name, Email, Status),
// not a table of related records like subitems.
export const ITEM_TABLE_LOOP_TAG = "item_fields";

// Detect the {{Placeholders}} used in an uploaded .docx (body + headers/footers).
// Strips XML tags first so tags split across runs are still detected.
// Loop control tags ({{#subitems}}, {{/subitems}}, {{#item_fields}}, etc.)
// are reported separately — they are NOT data placeholders and must never
// appear in the placeholder→column mapping UI.
export function extractPlaceholders(templateBuf: Buffer): {
  placeholders: string[];
  hasSubitemsLoop: boolean;
  hasItemTableLoop: boolean;
} {
  const zip = new PizZip(templateBuf);
  const names = new Set<string>();
  let hasSubitemsLoop = false;
  let hasItemTableLoop = false;
  for (const f of Object.keys(zip.files)) {
    if (!/word\/(document|header\d*|footer\d*)\.xml$/.test(f)) continue;
    const xml = zip.files[f].asText();
    const text = xml.replace(/<[^>]+>/g, "");
    for (const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      const raw = m[1].trim();
      if (!raw) continue;
      if (/^[#/^]/.test(raw)) {
        // Loop/section control tag, e.g. {{#subitems}}, {{/item_fields}}.
        const tag = raw.slice(1).trim();
        if (tag === SUBITEMS_LOOP_TAG) hasSubitemsLoop = true;
        if (tag === ITEM_TABLE_LOOP_TAG) hasItemTableLoop = true;
        continue;
      }
      names.add(raw);
    }
  }
  return { placeholders: [...names], hasSubitemsLoop, hasItemTableLoop };
}

// A fill value is either plain text, or — only under the reserved
// SUBITEMS_LOOP_TAG key — an array of row objects that docxtemplater's loop
// module expands into repeated table rows.
export type DocxFillValue = string | Record<string, string>[];

// Fill an uploaded .docx template with a data map and return the DOCX bytes.
// Values are either plain strings (regular placeholders) or, for the
// reserved "subitems" key, an array of { columnName: value } rows that
// docxtemplater's loop module expands into one repeated table row per
// subitem (Subitem tables — client requirement).
export function fillDocx(templateBuf: Buffer, data: Record<string, DocxFillValue>): Buffer {
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
