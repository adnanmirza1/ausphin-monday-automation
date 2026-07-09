"use client";

import { useState, useTransition } from "react";
import type { ColumnData, FormConfig } from "@/lib/board-types";
import { saveFormConfig } from "@/app/actions/form";

const FORM_TYPES = ["text", "longtext", "status", "date", "number", "email", "phone", "signature"];

export function FormButton({
  boardId,
  form,
  columns,
  groups = [],
}: {
  boardId: string;
  form: FormConfig;
  columns: ColumnData[];
  groups?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(form.enabled);
  const [title, setTitle] = useState(form.title);
  const [desc, setDesc] = useState(form.desc);
  const [cols, setCols] = useState<string[]>(form.columns);
  const [dedupe, setDedupe] = useState<string | null>(form.dedupeColumnId);
  const [groupId, setGroupId] = useState<string | null>(form.groupId ?? null);
  const [welcome, setWelcome] = useState(form.welcomeMessage ?? "");
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
        groupId: groupId && groups.some((g) => g.id === groupId) ? groupId : null,
        welcomeMessage: welcome,
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
          <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-hair bg-white shadow-pop">
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-hair px-5 py-4">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-teal/10 text-lg">📝</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-ink">Intake form</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      enabled ? "bg-teal/10 text-teal-deep" : "bg-canvas text-muted"
                    }`}
                  >
                    {enabled ? "● Live" : "Paused"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Share a public link so candidates can submit themselves.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="grid h-7 w-7 flex-none place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Body (scrolls) */}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 scroll-thin">
              {/* Live toggle card */}
              <button
                type="button"
                onClick={() => setEnabled((v) => !v)}
                className="flex w-full items-center gap-3 rounded-xl border border-hair bg-canvas/60 px-3 py-2.5 text-left hover:border-teal/40"
              >
                <span
                  className={`relative h-6 w-11 flex-none rounded-full transition-colors ${enabled ? "bg-teal" : "bg-hair"}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`}
                  />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-ink">Form is live</span>
                  <span className="block text-xs text-muted">
                    {enabled ? "Accepting responses right now" : "Paused — link won't accept submissions"}
                  </span>
                </span>
              </button>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-body">Form title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Candidate intake" className={inp} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-body">Description</span>
                <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short line shown under the title" className={inp} />
              </label>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-xs font-semibold text-body">Fields to include</span>
                  <span className="text-[11px] text-muted">{cols.length} selected</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {formCols.length === 0 && (
                    <p className="text-xs text-muted">No form-friendly columns on this board.</p>
                  )}
                  {formCols.map((c) => {
                    const on = cols.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleCol(c.id)}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
                          on
                            ? "border-teal bg-teal/10 font-medium text-teal-deep"
                            : "border-hair text-muted hover:border-teal/40 hover:text-body"
                        }`}
                      >
                        <span className={on ? "" : "opacity-0"}>✓</span>
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-body">De-dupe on (no duplicates)</span>
                <select
                  value={dedupe ?? ""}
                  onChange={(e) => setDedupe(e.target.value || null)}
                  className={inp}
                >
                  <option value="">Don&apos;t de-dupe</option>
                  {formCols
                    .filter((c) => cols.includes(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <span className="text-[11px] text-muted">
                  Repeat submissions with the same value update the existing row instead of adding a duplicate.
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-body">Send submissions to group</span>
                <select
                  value={groupId ?? ""}
                  onChange={(e) => setGroupId(e.target.value || null)}
                  className={inp}
                >
                  <option value="">First group (default)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <span className="text-[11px] text-muted">
                  New submissions land in this group (e.g. “New Leads”).
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-body">Welcome message (after submit)</span>
                <input
                  value={welcome}
                  onChange={(e) => setWelcome(e.target.value)}
                  placeholder="Thanks! Your submission was received."
                  className={inp}
                />
              </label>

              {enabled && link && (
                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-body">Public link</span>
                  <div className="flex items-center gap-2 rounded-lg border border-hair bg-canvas px-3 py-2">
                    <span className="truncate font-mono text-xs text-body">{link}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(link);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      className="ml-auto flex-none rounded bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-deep"
                    >
                      {copied ? "Copied!" : "Copy link"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-hair px-5 py-3">
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
