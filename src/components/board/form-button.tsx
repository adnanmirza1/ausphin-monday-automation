"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ColumnData, FormLite } from "@/lib/board-types";
import { createForm, updateForm, deleteForm, regenerateFormSlug } from "@/app/actions/form";

const FORM_TYPES = ["text", "longtext", "status", "date", "number", "email", "phone", "signature"];

export function FormButton({
  boardId,
  forms,
  columns,
  groups = [],
}: {
  boardId: string;
  forms: FormLite[];
  columns: ColumnData[];
  groups?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FormLite | null>(null);
  const router = useRouter();
  const [, start] = useTransition();
  const liveCount = forms.filter((f) => f.enabled).length;

  function newForm() {
    start(async () => {
      await createForm(boardId, "New form");
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
          liveCount ? "border-teal/40 bg-teal/5 text-teal-deep" : "border-hair text-body hover:bg-canvas"
        }`}
      >
        📝 Forms{liveCount ? ` · ${liveCount}` : ""}
      </button>

      {open && !editing && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-hair bg-white shadow-pop">
            <div className="flex items-center justify-between border-b border-hair px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-ink">Intake forms</h2>
                <p className="mt-0.5 text-xs text-muted">Add as many public forms as you need — each with its own group.</p>
              </div>
              <button onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-canvas">✕</button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4 scroll-thin">
              {forms.length === 0 && (
                <p className="py-6 text-center text-sm text-muted">No forms yet — create your first below.</p>
              )}
              {forms.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-xl border border-hair p-3">
                  <span className="text-lg">📝</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{f.title || "Untitled form"}</p>
                    <p className="text-xs text-muted">
                      {f.enabled ? "● Live" : "Paused"}
                      {f.slug && <> · /f/{f.slug}</>}
                    </p>
                  </div>
                  <button onClick={() => setEditing(f)} className="rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas">
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete form "${f.title || "Untitled"}"?`))
                        start(async () => {
                          await deleteForm(f.id);
                          router.refresh();
                        });
                    }}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
                  >
                    Delete
                  </button>
                </div>
              ))}
              <button
                onClick={newForm}
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-hair py-2.5 text-sm font-medium text-teal hover:border-teal hover:bg-teal/5"
              >
                <span className="text-base leading-none">＋</span> New form
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <FormEditor
          form={editing}
          columns={columns}
          groups={groups}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function FormEditor({
  form,
  columns,
  groups,
  onClose,
  onSaved,
}: {
  form: FormLite;
  columns: ColumnData[];
  groups: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(form.enabled);
  const [title, setTitle] = useState(form.title);
  const [desc, setDesc] = useState(form.desc);
  const [cols, setCols] = useState<string[]>(form.columns);
  const [dedupe, setDedupe] = useState<string | null>(form.dedupeColumnId);
  const [groupId, setGroupId] = useState<string | null>(form.groupId);
  const [welcome, setWelcome] = useState(form.welcomeMessage);
  const [copied, setCopied] = useState(false);
  const [slug, setSlug] = useState(form.slug);
  const [regen, startRegen] = useTransition();
  const [, start] = useTransition();

  const formCols = columns.filter((c) => FORM_TYPES.includes(c.type));
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = origin && slug ? `${origin}/f/${slug}` : "";

  function regenerate() {
    startRegen(async () => {
      const s = await regenerateFormSlug(form.id);
      if (s) setSlug(s);
    });
  }

  const toggleCol = (id: string) =>
    setCols((cs) => (cs.includes(id) ? cs.filter((x) => x !== id) : [...cs, id]));

  function save() {
    start(() =>
      void updateForm(form.id, {
        title,
        desc,
        enabled,
        config: {
          columns: cols,
          dedupeColumnId: dedupe && cols.includes(dedupe) ? dedupe : null,
          groupId: groupId && groups.some((g) => g.id === groupId) ? groupId : null,
          welcomeMessage: welcome,
        },
      })
    );
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[55] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-hair bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-hair px-5 py-4">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm text-muted hover:text-ink">‹ Forms</button>
            <h2 className="text-base font-bold text-ink">Edit form</h2>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${enabled ? "bg-teal/10 text-teal-deep" : "bg-canvas text-muted"}`}>
              {enabled ? "● Live" : "Paused"}
            </span>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-canvas">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 scroll-thin">
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl border border-hair bg-canvas/60 px-3 py-2.5 text-left hover:border-teal/40"
          >
            <span className={`relative h-6 w-11 flex-none rounded-full transition-colors ${enabled ? "bg-teal" : "bg-hair"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-ink">Form is live</span>
              <span className="block text-xs text-muted">{enabled ? "Accepting responses" : "Paused"}</span>
            </span>
          </button>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-body">Form title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Social media enquiry" className={inp} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-body">Description</span>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short line under the title" className={inp} />
          </label>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs font-semibold text-body">Fields to include</span>
              <span className="text-[11px] text-muted">{cols.length} selected</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {formCols.length === 0 && <p className="text-xs text-muted">No form-friendly columns.</p>}
              {formCols.map((c) => {
                const on = cols.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCol(c.id)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
                      on ? "border-teal bg-teal/10 font-medium text-teal-deep" : "border-hair text-muted hover:border-teal/40 hover:text-body"
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
            <select value={dedupe ?? ""} onChange={(e) => setDedupe(e.target.value || null)} className={inp}>
              <option value="">Don&apos;t de-dupe</option>
              {formCols.filter((c) => cols.includes(c.id)).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-body">Send submissions to group</span>
            <select value={groupId ?? ""} onChange={(e) => setGroupId(e.target.value || null)} className={inp}>
              <option value="">First group (default)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-body">Welcome message (after submit)</span>
            <input value={welcome} onChange={(e) => setWelcome(e.target.value)} placeholder="Thanks! Your submission was received." className={inp} />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-body">
              Shortened public link
            </span>
            {link ? (
              <>
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
                <button
                  onClick={regenerate}
                  disabled={regen}
                  className="mt-1.5 text-[11px] font-medium text-teal hover:underline disabled:opacity-50"
                >
                  {regen ? "Generating…" : "↻ Generate a new short link"}
                </button>
              </>
            ) : (
              <button
                onClick={regenerate}
                disabled={regen}
                className="rounded-lg border border-dashed border-hair px-3 py-2 text-xs font-medium text-teal hover:border-teal hover:bg-teal/5 disabled:opacity-50"
              >
                {regen ? "Generating…" : "🔗 Generate shortened URL"}
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-hair px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">Cancel</button>
          <button onClick={save} className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep">
            Save form
          </button>
        </div>
      </div>
    </div>
  );
}

const inp =
  "w-full rounded-lg border border-hair bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-teal";
