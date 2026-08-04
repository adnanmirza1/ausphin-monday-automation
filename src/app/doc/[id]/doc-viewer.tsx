"use client";

import { useRef } from "react";

export function DocViewer({ id, name, html, isDocx = false }: { id: string; name: string; html: string; isDocx?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);

  function print() {
    frame.current?.contentWindow?.focus();
    frame.current?.contentWindow?.print();
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair bg-white px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Generated document
          </p>
          <h1 className="truncate text-base font-bold text-ink">{name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {isDocx ? (
            <a
              href={`/doc/${id}/download?format=docx`}
              className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-deep"
            >
              ⬇ Download .docx
            </a>
          ) : (
            <>
              <a
                href={`/doc/${id}/download?format=pdf`}
                className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-deep"
              >
                ⬇ Download PDF
              </a>
              <a
                href={`/doc/${id}/download?format=docx`}
                className="rounded-lg border border-hair px-3 py-1.5 text-sm font-medium text-body hover:bg-canvas"
              >
                ⬇ Download Word
              </a>
              <button
                onClick={print}
                className="rounded-lg border border-hair px-3 py-1.5 text-sm font-medium text-body hover:bg-canvas"
              >
                🖨 Print
              </button>
            </>
          )}
        </div>
      </div>

      {/* paper */}
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        {isDocx ? (
          <div className="mx-auto max-w-xl rounded-xl border border-hair bg-white p-10 text-center shadow-soft">
            <p className="text-4xl">📄</p>
            <h2 className="mt-3 text-base font-bold text-ink">{name}</h2>
            <p className="mt-1 text-sm text-muted">
              This is a Word (.docx) document generated from a DocuGen template. Browsers can&rsquo;t
              preview .docx inline — download it to view or edit.
            </p>
            <a
              href={`/doc/${id}/download?format=docx`}
              className="mt-4 inline-block rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep"
            >
              ⬇ Download .docx
            </a>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl rounded-xl border border-hair bg-white shadow-soft">
            <iframe
              ref={frame}
              title={name}
              srcDoc={printableHtml(html)}
              className="h-[75vh] w-full rounded-xl"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Inject light document styling for on-screen + print rendering.
function printableHtml(html: string) {
  const style = `<style>
    body{font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;line-height:1.7;padding:48px;max-width:720px;margin:0 auto;}
    p{margin:0 0 14px;}
    @media print{body{padding:0;}}
  </style>`;
  if (html.includes("</head>")) return html.replace("</head>", `${style}</head>`);
  return `${style}${html}`;
}
