"use client";

import { useState, useTransition } from "react";
import type { ColumnData, FormConfig } from "@/lib/board-types";
import { saveFormConfig } from "@/app/actions/form";

const FORM_TYPES = ["text", "longtext", "status", "date", "number", "email", "phone", "signature"];

export function FormButton({
  boardId,
  form,
  columns,
}: {
  boardId: string;
  form: FormConfig;
  columns: ColumnData[];
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(form.enabled);
  const [title, setTitle] = useState(form.title);
  const [desc, setDesc] = useState(form.desc);
  const [cols, setCols] = useState<string[]>(form.columns);
  const [dedupe, setDedupe] = useState<string | null>(form.dedupeColumnId);
  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();

  const formCols = columns.filter((c) => FORM_TYPES.includes(c.type));
  const link = typeof window !== "undefined" ? `${window.location.origin}/form/${boardId}` : "";

  function toggleCol(id: string) {
    setCols((cs) => (cs.includes(id) ? cs.filter((x) => x !== id) : [...cs, id]));
  }

  function save() {
    start(() =>
      void saveFormConfig(boardId, {
        enabled,
        title,
        desc,
        columns: cols,
        dedupeColumnId: dedupe && cols.includes(dedupe) ? dedupe : null,
      })
    );
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
          form.enabled
            ? "border-teal/40 bg-teal/5 text-teal-deep"
            : "border-hair text-body hover:bg-canvas"
        }`}
      >
        📝 Form{form.enabled ? " · live" : ""}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-hair bg-white p-5 shadow-pop">
            <h2 className="text-lg font-bold text-ink">Intake form</h2>
            <p className="mt-0.5 text-sm text-muted">
              Share a public form. Choose a de-dupe field (e.g. Email) so repeat
              submissions update the existing record instead of creating duplicates.
            </p>

            <label className="mt-4 flex items-center gap-2 text-sm text-body">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Form is live (accepting responses)
            </label>

            <div className="mt-3 grid gap-3">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Form title" className={inp} />
              <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description" className={inp} />

              <div>
                <p className="mb-1.5 text-xs font-semibold text-body">Fields to include</p>
                <div className="flex flex-wrap gap-1.5">
                  {formCols.length === 0 && (
                    <p className="text-xs text-muted">No form-friendly columns on this board.</p>
                  )}
                  {formCols.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => toggleCol(c.id)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        cols.includes(c.id)
                          ? "border-teal bg-teal/10 text-teal-deep"
                          : "border-hair text-muted hover:border-teal/40"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-body">De-dupe on (no duplicates)</span>
                <select
                  value={dedupe ?? ""}
                  onChange={(e) => setDedupe(e.target.value || null)}
                  className={inp}
                >
                  <option value="">Don't de-dupe</option>
                  {formCols
                    .filter((c) => cols.includes(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </label>

              {enabled && link && (
                <div className="flex items-center gap-2 rounded-lg border border-hair bg-canvas px-3 py-2">
                  <span className="truncate font-mono text-xs text-body">{link}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(link);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="ml-auto flex-none rounded bg-teal px-2 py-1 text-xs font-semibold text-white hover:bg-teal-deep"
                  >
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">
                Cancel
              </button>
              <button onClick={save} className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep">
                Save form
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const inp =
  "w-full rounded-lg border border-hair bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-teal";
