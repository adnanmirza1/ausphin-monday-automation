import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun, ImageRun } from "docx";
import type { DocBlock } from "@/lib/docgen";

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

// PNG dimensions from the IHDR chunk.
function pngSize(bytes: Uint8Array): { w: number; h: number } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

// ── Real PDF (pdf-lib) ────────────────────────────────────────
export async function renderPdf(title: string, blocks: DocBlock[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const M = 56;
  const maxW = PAGE_W - M * 2;
  const size = 11;
  const lh = 16;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const ensure = (needed: number) => {
    if (y - needed < M) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - M;
    }
  };

  const drawLine = (text: string, f = font, s = size) => {
    ensure(lh);
    page.drawText(text, { x: M, y: y - s, size: s, font: f, color: rgb(0.08, 0.1, 0.15) });
    y -= lh;
  };

  const wrap = (text: string, f = font, s = size): string[] => {
    const out: string[] = [];
    for (const raw of text.split("\n")) {
      const words = raw.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        out.push("");
        continue;
      }
      let line = "";
      for (const w of words) {
        const trial = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(trial, s) > maxW && line) {
          out.push(line);
          line = w;
        } else {
          line = trial;
        }
      }
      if (line) out.push(line);
    }
    return out;
  };

  // Title
  for (const l of wrap(title, bold, 16)) drawLine(l, bold, 16);
  y -= 8;

  for (const b of blocks) {
    if (b.type === "text") {
      for (const l of wrap(b.text)) drawLine(l);
      y -= 6; // paragraph gap
    } else {
      const bytes = dataUrlToBytes(b.dataUrl);
      try {
        const img = await pdf.embedPng(bytes);
        const { w, h } = pngSize(bytes);
        const drawW = Math.min(220, maxW);
        const drawH = (h / w) * drawW;
        ensure(drawH + 8);
        page.drawImage(img, { x: M, y: y - drawH, width: drawW, height: drawH });
        y -= drawH + 8;
      } catch {
        drawLine("[signature]");
      }
    }
  }

  return pdf.save();
}

// ── Real Word (.docx, OOXML) ──────────────────────────────────
export async function renderDocx(title: string, blocks: DocBlock[]): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 32 })],
      spacing: { after: 200 },
    }),
  ];

  for (const b of blocks) {
    if (b.type === "text") {
      const runs: TextRun[] = [];
      b.text.split("\n").forEach((line, i) => {
        runs.push(new TextRun({ text: line, size: 22, break: i > 0 ? 1 : 0 }));
      });
      children.push(new Paragraph({ children: runs, spacing: { after: 160 } }));
    } else {
      const bytes = dataUrlToBytes(b.dataUrl);
      const { w, h } = pngSize(bytes);
      const drawW = Math.min(220, w);
      const drawH = (h / w) * drawW;
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data: bytes,
              transformation: { width: drawW, height: drawH },
            }),
          ],
          spacing: { after: 160 },
        })
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
