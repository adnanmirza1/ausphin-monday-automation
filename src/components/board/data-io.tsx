"use client";

import { useState, useTransition } from "react";
import type { BoardData } from "@/lib/board-types";
import { importItems } from "@/app/actions/board";
import { urlDisplay, parseFileValue } from "@/lib/cell-values";

// Resolve a cell to a plain string for export.
function cellText(board: BoardData, colId: string, item: BoardData["groups"][number]["items"][number]): string {
  const col = board.columns.find((c) => c.id === colId);
  const cell = item.cells[colId];
  if (!col || !cell) return "";
  if (col.type === "status") return col.labels.find((l) => l.id === cell.value)?.label ?? "";
  if (col.type === "person") return cell.person?.name ?? "";
  if (col.type === "connection" || col.type === "mirror") return cell.display ?? "";
  if (col.type === "url") return urlDisplay(cell.value);
  if (col.type === "file") return parseFileValue(cell.value).map((f) => f.name).join(", ");
  return cell.value ?? "";
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function htmlEscape(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Minimal CSV parser (handles quoted fields, commas, newlines, "" escapes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

export function ImportExportButton({ board }: { board: BoardData }) {
  const [menu, setMenu] = useState(false);
  const [importing, setImporting] = useState(false);

  function exportCsv() {
    setMenu(false);
    const headers = ["Name", ...board.columns.map((c) => c.name)];
    const lines = [headers.map(csvEscape).join(",")];
    for (const g of board.groups) {
      for (const it of g.items) {
        const cols = board.columns.map((c) => cellText(board, c.id, it));
        lines.push([it.name, ...cols].map(csvEscape).join(","));
      }
    }
    download(
      new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" }),
      `${board.name.replace(/[^\w]+/g, "-")}.csv`
    );
  }

  // Export ALL board data to Excel (.xls). Includes the group of every row so
  // the full board is captured. Opens in Excel and Google Sheets.
  function exportExcel() {
    setMenu(false);
    const headers = ["Group", "Name", ...board.columns.map((c) => c.name)];
    const head = `<tr>${headers.map((h) => `<th>${htmlEscape(h)}</th>`).join("")}</tr>`;
    const body: string[] = [];
    for (const g of board.groups) {
      for (const it of g.items) {
        const cells = [g.name, it.name, ...board.columns.map((c) => cellText(board, c.id, it))];
        body.push(`<tr>${cells.map((v) => `<td>${htmlEscape(v)}</td>`).join("")}</tr>`);
      }
    }
    const table = `<table border="1"><thead>${head}</thead><tbody>${body.join("")}</tbody></table>`;
    const html =
      `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
      `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
      `xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">` +
      `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>` +
      `<x:Name>${htmlEscape(board.name).slice(0, 31)}</x:Name>` +
      `<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>` +
      `</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->` +
      `</head><body>${table}</body></html>`;
    download(
      new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8;" }),
      `${board.name.replace(/[^\w]+/g, "-")}.xls`
    );
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setMenu((o) => !o)}
          className="rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas"
        >
          ⇅ Data
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute right-0 z-50 mt-1 w-44 rounded-lg border border-hair bg-white p-1 shadow-pop">
              <button onClick={exportExcel} className="block w-full rounded px-2 py-1.5 text-left text-sm text-body hover:bg-canvas">
                ⬇ Export all data (Excel)
              </button>
              <button onClick={exportCsv} className="block w-full rounded px-2 py-1.5 text-left text-sm text-body hover:bg-canvas">
                ⬇ Export to CSV
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  setImporting(true);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-sm text-body hover:bg-canvas"
              >
                ⬆ Import from CSV
              </button>
            </div>
          </>
        )}
      </div>
      {importing && <ImportModal board={board} onClose={() => setImporting(false)} />}
    </>
  );
}

function ImportModal({ board, onClose }: { board: BoardData; onClose: () => void }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [header, setHeader] = useState<string[]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [groupId, setGroupId] = useState(board.groups[0]?.id ?? "");
  const [done, setDone] = useState<number | null>(null);
  const [, start] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result));
      if (parsed.length === 0) return;
      const hdr = parsed[0];
      setHeader(hdr);
      setRows(parsed.slice(1));
      // Auto-map by matching header text to column names; first col → Name.
      setMapping(
        hdr.map((h, i) => {
          if (i === 0) return "__name__";
          const match = board.columns.find((c) => c.name.toLowerCase() === h.trim().toLowerCase());
          return match ? match.id : "";
        })
      );
    };
    reader.readAsText(file);
  }

  function runImport() {
    if (!rows) return;
    start(async () => {
      const n = await importItems(board.id, groupId, header, rows, mapping);
      setDone(n);
    });
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-hair bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-hair px-5 py-4">
          <h2 className="text-base font-bold text-ink">Import from CSV</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-canvas">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 scroll-thin">
          {done !== null ? (
            <p className="py-8 text-center text-sm text-body">
              ✅ Imported <b>{done}</b> row{done === 1 ? "" : "s"} into the board.
            </p>
          ) : !rows ? (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-hair py-10 text-sm text-muted hover:border-teal hover:text-teal">
              <span className="text-2xl">⬆</span>
              Choose a .csv file (first row = headers)
              <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
            </label>
          ) : (
            <>
              <div>
                <span className="mb-1 block text-xs font-semibold text-body">Add rows to group</span>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full rounded-lg border border-hair px-2.5 py-2 text-sm outline-none focus:border-teal"
                >
                  {board.groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-body">Map columns ({rows.length} rows)</p>
                <div className="space-y-1.5">
                  {header.map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-1/3 truncate text-xs text-muted" title={h}>{h || `Column ${i + 1}`}</span>
                      <span className="text-muted">→</span>
                      <select
                        value={mapping[i] ?? ""}
                        onChange={(e) =>
                          setMapping((m) => m.map((v, idx) => (idx === i ? e.target.value : v)))
                        }
                        className="flex-1 rounded-lg border border-hair px-2 py-1.5 text-sm outline-none focus:border-teal"
                      >
                        <option value="">— Skip —</option>
                        <option value="__name__">Item name</option>
                        {board.columns
                          .filter((c) => !["connection", "mirror", "signature", "file"].includes(c.type))
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-hair px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">
            {done !== null ? "Done" : "Cancel"}
          </button>
          {rows && done === null && (
            <button
              onClick={runImport}
              className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep"
            >
              Import {rows.length} rows
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
