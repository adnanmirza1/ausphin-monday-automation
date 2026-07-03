import "server-only";
import { db } from "@/lib/db";
import { renderDocumentHtml, buildBlocks, type DocValue } from "@/lib/docgen";
import type { StatusLabel } from "@/lib/constants";

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
