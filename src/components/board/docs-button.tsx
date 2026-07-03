"use client";

import { useState, useTransition } from "react";
import type { ColumnData } from "@/lib/board-types";
import { createTemplate, updateTemplate, deleteTemplate } from "@/app/actions/docs";

export type TemplateLite = { id: string; name: string; body: string };

export function DocsButton({
  boardId,
  templates,
  columns,
}: {
  boardId: string;
  templates: TemplateLite[];
  columns: ColumnData[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateLite | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [, start] = useTransition();

  const placeholders = ["Item", ...columns.map((c) => c.name)];

  function startNew() {
    setEditing({ id: "", name: "", body: "" });
    setName("");
    setBody("Dear {{Item}},\n\nThis confirms your enrolment in {{Program}}.\n\nRegards,\nOsphine");
  }
  function startEdit(t: TemplateLite) {
    setEditing(t);
    setName(t.name);
    setBody(t.body);
  }
  function insert(token: string) {
    setBody((b) => `${b}{{${token}}}`);
  }
  function save() {
    if (!editing) return;
    if (editing.id) start(() => void updateTemplate(boardId, editing.id, name, body));
    else start(() => void createTemplate(boardId, name, body));
    setEditing(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas"
      >
        📄 Docs
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-hair bg-white p-5 shadow-pop">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-ink">Document templates</h2>
                <p className="text-sm text-muted">
                  Use {"{{Placeholders}}"} that fill from each item's data.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-ink">✕</button>
            </div>

            {!editing ? (
              <div className="mt-4 flex-1 overflow-auto scroll-thin">
                <button
                  onClick={startNew}
                  className="mb-3 rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-deep"
                >
                  + New template
                </button>
                <div className="grid gap-2">
                  {templates.length === 0 && (
                    <p className="rounded-lg border border-dashed border-hair py-8 text-center text-sm text-muted">
                      No templates yet.
                    </p>
                  )}
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-lg border border-hair px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{t.name}</p>
                        <p className="truncate text-xs text-muted">{t.body.slice(0, 80)}</p>
                      </div>
                      <div className="flex flex-none gap-2">
                        <button onClick={() => startEdit(t)} className="text-xs text-teal hover:underline">
                          Edit
                        </button>
                        <button
                          onClick={() => start(() => void deleteTemplate(boardId, t.id))}
                          className="text-xs text-muted hover:text-danger"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 flex-1 overflow-auto scroll-thin">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Template name (e.g. Osphine Contract)"
                  className="mb-2 w-full rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
                />
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <span className="text-xs font-semibold text-body">Insert:</span>
                  {placeholders.map((p) => (
                    <button
                      key={p}
                      onClick={() => insert(p)}
                      className="rounded-full border border-hair px-2 py-0.5 font-mono text-[11px] text-teal-deep hover:border-teal"
                    >
                      {"{{"}{p}{"}}"}
                    </button>
                  ))}
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="w-full resize-none rounded-lg border border-hair px-3 py-2 font-mono text-sm outline-none focus:border-teal"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={() => setEditing(null)} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">
                    Back
                  </button>
                  <button
                    onClick={save}
                    disabled={!name.trim()}
                    className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
                  >
                    Save template
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
