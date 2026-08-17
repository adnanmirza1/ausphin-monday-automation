import "server-only";
import { db } from "@/lib/db";
import { renderDocumentHtml, buildBlocks, type DocValue } from "@/lib/docgen";
import type { StatusLabel } from "@/lib/constants";
import { urlDisplay, parseFileValue, type FileValue } from "@/lib/cell-values";
import { putFile, fetchFileBuffer } from "@/lib/blob-storage";
import { fillDocx, DOCX_MIME, SUBITEMS_LOOP_TAG, type DocxFillValue } from "@/lib/docx-fill";
import { resolveColumnBySlug, slugifyColumnName, ITEM_NAME_SLUG } from "@/lib/placeholders";
import { convertDocxToPdf, cloudconvertConfigured } from "@/lib/cloudconvert";
import type { Prisma } from "@/generated/prisma/client";

export const PDF_MIME = "application/pdf";

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

type ItemWithCells = Prisma.ItemGetPayload<{
  include: { cells: { include: { column: true; person: true } }; board: { include: { columns: true } } };
}>;

// Resolve an item's cells into a { columnName -> DocValue } map (status
// labels, person names, signatures, connections, and mirrors all resolved).
// Shared by both real generation and template previews so they can never
// drift from each other.
async function resolveItemValues(item: ItemWithCells): Promise<Record<string, DocValue>> {
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
  return values;
}

type SubitemLite = {
  id: string;
  name: string;
  cells: { columnId: string; value: string | null; personId: string | null }[];
};

// Resolve subitem rows for the {{#subitems}} table loop (Subitem tables —
// client requirement): one row per subitem, values for the chosen board
// columns (status labels and person names resolved to display text;
// connection/mirror/signature/file columns are skipped as not
// table-friendly). `subitemColumns` (board column names, in order) picks
// which fields appear — empty means "all eligible columns" so a template
// still works before the user configures a subset.
async function resolveSubitemRowsForItem(
  subitems: SubitemLite[],
  boardColumns: { id: string; name: string; type: string }[],
  subitemColumns: string[]
): Promise<Record<string, string>[]> {
  if (subitems.length === 0) return [];

  const eligibleTypes = new Set(["text", "longtext", "status", "person", "date", "number", "email", "phone", "url"]);
  const cols = boardColumns.filter((c) => eligibleTypes.has(c.type));
  const chosen = subitemColumns.length ? cols.filter((c) => subitemColumns.includes(c.name)) : cols;

  const statusColumnIds = new Set(chosen.filter((c) => c.type === "status").map((c) => c.id));
  const statusCols = await db.column.findMany({
    where: { id: { in: [...statusColumnIds] } },
    select: { id: true, config: true },
  });
  const statusLabelsByColumn = new Map(
    statusCols.map((c) => {
      try {
        return [c.id, (JSON.parse(c.config).labels ?? []) as { id: string; label: string }[]] as const;
      } catch {
        return [c.id, [] as { id: string; label: string }[]] as const;
      }
    })
  );

  const personIds = new Set(
    subitems.flatMap((s) => s.cells.filter((c) => c.personId).map((c) => c.personId!))
  );
  const peopleRows = personIds.size
    ? await db.user.findMany({ where: { id: { in: [...personIds] } }, select: { id: true, name: true } })
    : [];
  const people = new Map(peopleRows.map((p) => [p.id, { name: p.name }]));

  return subitems.map((sub) => {
    const row: Record<string, string> = { name: sub.name };
    for (const col of chosen) {
      const cell = sub.cells.find((c) => c.columnId === col.id);
      let text = cell?.value ?? "";
      if (col.type === "status" && cell?.value) {
        const labels = statusLabelsByColumn.get(col.id) ?? [];
        text = labels.find((l) => l.id === cell.value)?.label ?? "";
      } else if (col.type === "person" && cell?.personId) {
        text = people.get(cell.personId)?.name ?? "";
      }
      row[col.name] = text;
    }
    return row;
  });
}

// Build the flat { placeholder -> filled text } map docxtemplater needs,
// given a docx template's detected placeholders/mapping and an item's
// resolved values. Shared by real generation and previews — the SAME
// resolution order (explicit mapping -> exact column name -> {{item}} ->
// deterministic slug fallback) that the placeholder reference UI guarantees
// (see placeholders.ts / Improvement 2). Also injects the "subitems" loop
// array (Subitem tables — client requirement) when the template uses it.
function buildDocxFillData(
  itemName: string,
  boardColumns: { id: string; name: string; type: string }[],
  placeholders: string[],
  mapping: Record<string, string>,
  values: Record<string, DocValue>,
  subitemRows?: Record<string, string>[]
): Record<string, DocxFillValue> {
  const textOf = (colName: string): string => {
    if (!colName) return "";
    if (colName === "Item" || colName === "{{Item}}") return itemName;
    const v = values[colName];
    return v && "text" in v ? v.text ?? "" : "";
  };
  // Signature anchors ({{Signature_1}}, {{Signer_Name_1}}, {{Signed_Date_1}},
  // {{Initial_1}}, {{Date_Signed_1}}) are NOT data — keep them literal so
  // DocuSign can convert them to signature fields later.
  const isSignatureAnchor = (p: string) => /^(signature|signer_name|signed_date|date_signed|initial)_?\d*$/i.test(p);
  const data: Record<string, DocxFillValue> = {};
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
      data[p] = itemName; // the deterministic {{item}} placeholder (Improvement 2)
    } else {
      // Deterministic slug fallback (Improvement 2): guarantees every
      // placeholder shown in the placeholder reference UI resolves here,
      // even without an explicit mapping entry.
      const col = resolveColumnBySlug(p, boardColumns);
      data[p] = col ? textOf(col.name) : "";
    }
  }
  if (subitemRows) data[SUBITEMS_LOOP_TAG] = subitemRows;
  return data;
}

export type GenerateResult = { ok: true; id: string } | { ok: false; error: string };

// Core document generation (no auth) — used by the manual action and by
// automations. Fills a template from an item's data (resolving status labels,
// people, signatures, connections, and mirrors), saves a GeneratedDocument,
// and attaches its link to the board's first file column ("output").
export async function generateDocumentCoreDetailed(
  itemId: string,
  templateId: string
): Promise<GenerateResult> {
  const [item, template] = await Promise.all([
    db.item.findUnique({
      where: { id: itemId },
      include: {
        cells: { include: { column: true, person: true } },
        board: { include: { columns: true } },
        subitems: { orderBy: { position: "asc" }, include: { cells: true } },
      },
    }),
    db.docTemplate.findUnique({ where: { id: templateId } }),
  ]);
  if (!item || !template) return { ok: false, error: "Item or template not found." };

  const values = await resolveItemValues(item);

  // ── DocuGen .docx path: fill the uploaded .docx and save to a file column ──
  if (template.kind === "docx" && template.docxUrl) {
    let placeholders: string[] = [];
    let mapping: Record<string, string> = {};
    let subitemColumns: string[] = [];
    try {
      placeholders = JSON.parse(template.placeholders);
    } catch {}
    try {
      mapping = JSON.parse(template.mapping);
    } catch {}
    try {
      subitemColumns = JSON.parse(template.subitemColumns);
    } catch {}
    const subitemRows = template.hasSubitemsLoop
      ? await resolveSubitemRowsForItem(item.subitems, item.board.columns, subitemColumns)
      : undefined;
    const data = buildDocxFillData(item.name, item.board.columns, placeholders, mapping, values, subitemRows);

    let outBuf: Buffer;
    try {
      const tplBuf = await fetchFileBuffer(template.docxUrl);
      outBuf = fillDocx(tplBuf, data);
    } catch (e) {
      console.error("[docgen:docx]", e);
      return { ok: false, error: "Could not fill the .docx template — it may be corrupted or use unsupported formatting." };
    }

    // Real PDF conversion (via CloudConvert — pdf-lib can't parse an actual
    // .docx's formatting, only draw a new PDF from scratch). Falls back to
    // DOCX with a clear error surfaced to the caller when PDF isn't
    // configured or the conversion fails, rather than silently mislabeling
    // a .docx file as the requested PDF.
    let finalBuf: Buffer = outBuf;
    let finalMime = DOCX_MIME;
    let finalExt = "docx";
    let conversionError: string | undefined;
    if (template.outputFormat === "pdf") {
      if (!cloudconvertConfigured()) {
        conversionError = "PDF conversion isn't configured yet — saved as DOCX instead.";
      } else {
        try {
          finalBuf = await convertDocxToPdf(outBuf, `${safeName(template.name)}.docx`);
          finalMime = PDF_MIME;
          finalExt = "pdf";
        } catch (e) {
          conversionError = e instanceof Error ? e.message : "PDF conversion failed — saved as DOCX instead.";
        }
      }
    }

    const fileName = `${safeName(template.name)}-${safeName(item.name)}.${finalExt}`;
    const url = await putFile(`docs/${itemId}/${Date.now()}-${fileName}`, finalBuf, finalMime);
    const doc = await db.generatedDocument.create({
      data: {
        itemId,
        templateId,
        name: `${template.name} — ${item.name}`,
        html: "",
        content: JSON.stringify({ fileUrl: url, fileName, format: finalExt, conversionError }),
      },
    });
    const outCol = template.outputColumnId
      ? item.board.columns.find((c) => c.id === template.outputColumnId && c.type === "file")
      : item.board.columns.find((c) => c.type === "file");
    if (outCol) await appendToFileColumn(itemId, outCol.id, { name: fileName, type: finalMime, url });
    return { ok: true, id: doc.id };
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

  return { ok: true, id: doc.id };
}

// Backward-compatible simple wrapper — used by the automation engine, which
// only needs the id (or null on failure) and already logs its own
// success/error messages to the item timeline.
export async function generateDocumentCore(itemId: string, templateId: string): Promise<string | null> {
  const result = await generateDocumentCoreDetailed(itemId, templateId);
  return result.ok ? result.id : null;
}

export type PreviewResult = { ok: true; dataUrl: string; format: "pdf" | "docx" } | { ok: false; error: string };

// Visual preview (Improvement request): fill a docx template with a real
// item's data and render it as a PDF the user can view inline, WITHOUT
// creating a GeneratedDocument row or writing to any file column — this is
// a look-before-you-generate preview, not a real generation. Uses the exact
// same fill logic as generateDocumentCoreDetailed (via the shared helpers
// above) so the preview is guaranteed to match what "Generate" would
// actually produce.
export async function renderTemplatePreview(itemId: string, templateId: string): Promise<PreviewResult> {
  const [item, template] = await Promise.all([
    db.item.findUnique({
      where: { id: itemId },
      include: {
        cells: { include: { column: true, person: true } },
        board: { include: { columns: true } },
        subitems: { orderBy: { position: "asc" }, include: { cells: true } },
      },
    }),
    db.docTemplate.findUnique({ where: { id: templateId } }),
  ]);
  if (!item || !template) return { ok: false, error: "Item or template not found." };
  if (template.kind !== "docx" || !template.docxUrl) {
    return { ok: false, error: "Preview is only available for .docx templates." };
  }

  const values = await resolveItemValues(item);
  let placeholders: string[] = [];
  let mapping: Record<string, string> = {};
  let subitemColumns: string[] = [];
  try {
    placeholders = JSON.parse(template.placeholders);
  } catch {}
  try {
    mapping = JSON.parse(template.mapping);
  } catch {}
  try {
    subitemColumns = JSON.parse(template.subitemColumns);
  } catch {}
  const subitemRows = template.hasSubitemsLoop
    ? await resolveSubitemRowsForItem(item.subitems, item.board.columns, subitemColumns)
    : undefined;
  const data = buildDocxFillData(item.name, item.board.columns, placeholders, mapping, values, subitemRows);

  let filledBuf: Buffer;
  try {
    const tplBuf = await fetchFileBuffer(template.docxUrl);
    filledBuf = fillDocx(tplBuf, data);
  } catch (e) {
    console.error("[docgen:preview:fill]", e);
    return { ok: false, error: "Could not fill the .docx template for preview — it may be corrupted or use unsupported formatting." };
  }

  if (!cloudconvertConfigured()) {
    return { ok: false, error: "Visual preview isn't configured yet — add a PDF conversion API key to enable it." };
  }
  try {
    const pdfBuf = await convertDocxToPdf(filledBuf, `${safeName(template.name)}.docx`);
    return { ok: true, dataUrl: `data:${PDF_MIME};base64,${pdfBuf.toString("base64")}`, format: "pdf" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Preview conversion failed.";
    return { ok: false, error: message };
  }
}
