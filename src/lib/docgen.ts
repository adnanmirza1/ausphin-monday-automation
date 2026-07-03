// DocuGen placeholder engine. Templates use {{Placeholder}} tokens mapping to
// column names (case-insensitive) or {{Item}}/{{Name}}.
// A value is text OR an image (signature data URL).

export type DocValue = { text?: string; image?: string };
export type DocBlock = { type: "text"; text: string } | { type: "image"; dataUrl: string };

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function lookupOf(values: Record<string, DocValue>) {
  const m = new Map<string, DocValue>();
  for (const [k, v] of Object.entries(values)) m.set(k.trim().toLowerCase(), v);
  return m;
}

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;

// Structured blocks (text paragraphs + image blocks) for PDF/DOCX export.
export function buildBlocks(body: string, values: Record<string, DocValue>): DocBlock[] {
  const lookup = lookupOf(values);
  const blocks: DocBlock[] = [];
  for (const para of body.split(/\n{2,}/)) {
    let text = "";
    let last = 0;
    let m: RegExpExecArray | null;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(para))) {
      text += para.slice(last, m.index);
      const v = lookup.get(m[1].trim().toLowerCase());
      if (v?.image) {
        if (text.trim()) blocks.push({ type: "text", text });
        text = "";
        blocks.push({ type: "image", dataUrl: v.image });
      } else {
        text += v?.text ?? "";
      }
      last = TOKEN.lastIndex;
    }
    text += para.slice(last);
    if (text.trim()) blocks.push({ type: "text", text });
  }
  return blocks;
}

// HTML rendering for the on-screen viewer / browser print.
export function renderBody(body: string, values: Record<string, DocValue>): string {
  const lookup = lookupOf(values);
  return body
    .split(/\n{2,}/)
    .map((para) => {
      let out = "";
      let last = 0;
      let m: RegExpExecArray | null;
      TOKEN.lastIndex = 0;
      while ((m = TOKEN.exec(para))) {
        out += escapeHtml(para.slice(last, m.index)).replace(/\n/g, "<br/>");
        const v = lookup.get(m[1].trim().toLowerCase());
        out += v?.image
          ? `<img src="${v.image}" alt="signature" style="max-height:90px;display:block"/>`
          : escapeHtml(v?.text ?? "");
        last = TOKEN.lastIndex;
      }
      out += escapeHtml(para.slice(last)).replace(/\n/g, "<br/>");
      return `<p>${out}</p>`;
    })
    .join("\n");
}

export function renderDocumentHtml(
  title: string,
  body: string,
  values: Record<string, DocValue>
): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title
  )}</title></head><body>${renderBody(body, values)}</body></html>`;
}
