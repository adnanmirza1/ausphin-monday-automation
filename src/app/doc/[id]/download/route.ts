import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderPdf, renderDocx } from "@/lib/export-doc";
import type { DocBlock } from "@/lib/docgen";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await db.generatedDocument.findUnique({
    where: { id },
    include: { item: { include: { board: { include: { environment: true } } } } },
  });
  if (!doc || doc.item.board.environment.orgId !== user.orgId) {
    return new Response("Not found", { status: 404 });
  }

  const format = new URL(request.url).searchParams.get("format") ?? "pdf";
  const filename = (doc.name.replace(/[^\w\- ]+/g, "").trim() || "document");
  let blocks: DocBlock[] = [];
  try {
    blocks = JSON.parse(doc.content);
  } catch {}

  if (format === "docx") {
    const buf = await renderDocx(doc.name, blocks);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}.docx"`,
      },
    });
  }

  if (format === "html") {
    return new Response(doc.html, {
      headers: {
        "Content-Type": "application/msword",
        "Content-Disposition": `attachment; filename="${filename}.doc"`,
      },
    });
  }

  // Default: real PDF.
  const pdf = await renderPdf(doc.name, blocks);
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}
