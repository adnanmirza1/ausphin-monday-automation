import "server-only";
import { db } from "@/lib/db";
import { renderDocumentHtml, buildBlocks, type DocValue } from "@/lib/docgen";
import type { StatusLabel } from "@/lib/constants";
import { urlDisplay, parseFileValue, type FileValue } from "@/lib/cell-values";
import { putFile, fetchFileBuffer } from "@/lib/blob-storage";
import { fillDocx, DOCX_MIME } from "@/lib/docx-fill";
import { resolveColumnBySlug, slugifyColumnName, ITEM_NAME_SLUG } from "@/lib/placeholders";

function safeName(s: string): string {
  return s.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || "document";
}

// Append a generated file to a File column's cell value (JSON array of files).
async function appendToFileColumn(itemId: string, columnId: string, file: FileValue) {
  const existing = await db.cell.findUnique({
    where: { itemId_columnId: { itemId, columnId } },
    select: { value: true },
  });
  const list = parseFileValue(existing?.value).filter((f) => f.url.startsWith("data:") || f.url.startsWith("http"));
  const next = JSON.stringify([...list, file]);
  await db.cell.upsert({
    where: { itemId_columnId: { itemId, columnId } },
    create: { itemId, columnId, value: next },
    update: { value: next },
  });
}

// Core document generation (no auth) — used by the manual action and by
// automations. Fills a template from an item's data (resolving status labels,
// people, signatures, connections, and mirrors), saves a GeneratedDocument,
// and attaches its link to the board's first file column ("output").
export async function generateDocumentCore(
  itemId: string,
  templateId: string
): Promise<string | null> {
  const [item, template] = await Promise.all([
    db.item.findUnique({
      where: { id: itemId },
      include: {
        cells: { include: { column: true, person: true } },
        board: { include: { columns: true } },
      },
    }),
    db.docTemplate.findUnique({ where: { id: templateId } }),
  ]);
  if (!item || !template) return null;

  const connCellVals = item.cells
    .filter((c) => c.column.type === "connection" && c.value)
    .map((c) => c.value!) as string[];
  const linkedItems = await db.item.findMany({
    where: { id: { in: connCellVals } },
    include: { cells: { include: { person: true } }, board: { include: { columns: true } } },
  });
  const linkedMap = new Map(linkedItems.map((li) => [li.id, li]));
  const resolveSource = (linkedItemId: string, sourceColumnId: string): string => {
    const li = linkedMap.get(linkedItemId);
    if (!li) return "";
    const col = li.board.columns.find((c) => c.id === sourceColumnId);
    const cell = li.cells.find((c) => c.columnId === sourceColumnId);
    const v = cell?.value ?? "";
    if (!col) return v;
    if (col.type === "status") {
      try {
        const labels: StatusLabel[] = JSON.parse(col.config).labels ?? [];
        return labels.find((l) => l.id === v)?.label ?? "";
      } catch {
        return "";
      }
    }
    if (col.type === "person") return cell?.person?.name ?? "";
    return v;
  };

  const values: Record<string, DocValue> = {
    Item: { text: item.name },
    Name: { text: item.name },
  };
  for (const cell of item.cells) {
    const col = cell.column;
    if (col.type === "status") {
      let label = "";
      try {
        const labels: StatusLabel[] = JSON.parse(col.config).labels ?? [];
        label = labels.find((l) => l.id === cell.value)?.label ?? "";
      } catch {}
      values[col.name] = { text: label };
    } else if (col.type === "person") {
      values[col.name] = { text: cell.person?.name ?? "" };
    } else if (col.type === "signature") {
      values[col.name] = cell.value?.startsWith("data:image")
        ? { image: cell.value }
        : { text: "" };
    } else if (col.type === "connection") {
      values[col.name] = { text: cell.value ? linkedMap.get(cell.value)?.name ?? "" : "" };
    } else if (col.type === "url") {
      values[col.name] = { text: urlDisplay(cell.value) };
    } else if (col.type === "file") {
      values[col.name] = { text: parseFileValue(cell.value).map((f) => f.name).join(", ") };
    } else {
      values[col.name] = { text: cell.value ?? "" };
    }
  }
  for (const col of item.board.columns.filter((c) => c.type === "mirror")) {
    let connectionColumnId = "";
    let sourceColumnId = "";
    try {
      const cfg = JSON.parse(col.config);
      connectionColumnId = cfg.connectionColumnId ?? "";
      sourceColumnId = cfg.sourceColumnId ?? "";
    } catch {}
    const connCell = item.cells.find((c) => c.columnId === connectionColumnId);
    values[col.name] =
      connCell?.value && sourceColumnId
        ? { text: resolveSource(connCell.value, sourceColumnId) }
        : { text: "" };
  }

  // ── DocuGen .docx path: fill the uploaded .docx and save to a file column ──
  if (template.kind === "docx" && template.docxUrl) {
    let placeholders: string[] = [];
    let mapping: Record<string, string> = {};
    try {
      placeholders = JSON.parse(template.placeholders);
    } catch {}
    try {
      mapping = JSON.parse(template.mapping);
    } catch {}
    const textOf = (colName: string): string => {
      if (!colName) return "";
      if (colName === "Item" || colName === "{{Item}}") return item.name;
      const v = values[colName];
      return v && "text" in v ? v.text ?? "" : "";
    };
    // Signature anchors ({{Signature_1}}, {{Signer_Name_1}}, {{Signed_Date_1}},
    // {{Initial_1}}, {{Date_Signed_1}}) are NOT data — keep them literal so
    // DocuSign can convert them to signature fields later (section 7).
    const isSignatureAnchor = (p: string) => /^(signature|signer_name|signed_date|date_signed|initial)_?\d*$/i.test(p);
    const data: Record<string, string> = {};
    for (const p of placeholders) {
      if (isSignatureAnchor(p)) {
        data[p] = `{{${p}}}`; // echo back so the anchor text survives filling
        continue;
      }
      const mapped = mapping[p];
      if (mapped) {
        data[p] = textOf(mapped);
      } else if (textOf(p)) {
        data[p] = textOf(p); // exact same-named column
      } else if (slugifyColumnName(p) === ITEM_NAME_SLUG) {
        data[p] = item.name; // the deterministic {{item}} placeholder (Improvement 2)
      } else {
        // Deterministic slug fallback (Improvement 2): guarantees every
        // placeholder shown in the placeholder reference UI resolves here,
        // even without an explicit mapping entry.
        const col = resolveColumnBySlug(p, item.board.columns);
        data[p] = col ? textOf(col.name) : "";
      }
    }
    let outBuf: Buffer;
    try {
      const tplBuf = await fetchFileBuffer(template.docxUrl);
      outBuf = fillDocx(tplBuf, data);
    } catch (e) {
      console.error("[docgen:docx]", e);
      return null;
    }
    const fileName = `${safeName(template.name)}-${safeName(item.name)}.docx`;
    const url = await putFile(`docs/${itemId}/${Date.now()}-${fileName}`, outBuf, DOCX_MIME);
    const doc = await db.generatedDocument.create({
      data: {
        itemId,
        templateId,
        name: `${template.name} — ${item.name}`,
        html: "",
        content: JSON.stringify({ fileUrl: url, fileName, format: "docx" }),
      },
    });
    const outCol = template.outputColumnId
      ? item.board.columns.find((c) => c.id === template.outputColumnId && c.type === "file")
      : item.board.columns.find((c) => c.type === "file");
    if (outCol) await appendToFileColumn(itemId, outCol.id, { name: fileName, type: DOCX_MIME, url });
    return doc.id;
  }

  const title = `${template.name} — ${item.name}`;
  const html = renderDocumentHtml(title, template.body, values);
  const blocks = buildBlocks(template.body, values);
  const doc = await db.generatedDocument.create({
    data: { itemId, templateId, name: title, html, content: JSON.stringify(blocks) },
  });

  // Attach the document link to the board's first file column ("output").
  const fileCol = item.board.columns.find((c) => c.type === "file");
  if (fileCol) {
    await db.cell.upsert({
      where: { itemId_columnId: { itemId, columnId: fileCol.id } },
      create: { itemId, columnId: fileCol.id, value: `/doc/${doc.id}` },
      update: { value: `/doc/${doc.id}` },
    });
  }

  return doc.id;
}
