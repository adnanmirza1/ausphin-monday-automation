"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  getDocuGenData,
  uploadDocxTemplate,
  saveTemplateMeta,
  replaceTemplateFile,
  duplicateTemplate,
  deleteTemplate,
  setTemplatesActive,
  type DocuGenData,
  type DocuGenTemplate,
} from "@/app/actions/docs";

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function DocuGenButton({ boardId }: { boardId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas"
        title="DocuGen .docx templates"
      >
        🗂 DocuGen
      </button>
      {open && <DocuGenModal boardId={boardId} onClose={() => setOpen(false)} />}
    </>
  );
}

function DocuGenModal({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const [data, setData] = useState<DocuGenData | null>(null);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, start] = useTransition();

  const refresh = () => getDocuGenData(boardId).then(setData);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templates = useMemo(() => data?.templates ?? [], [data]);
  const folders = useMemo(
    () => [...new Set(templates.map((t) => t.folder).filter(Boolean))].sort(),
    [templates]
  );
  const filtered = templates.filter((t) => {
    if (folder && (t.folder || "") !== folder) return false;
    if (!showInactive && !t.active) return false;
    const s = q.toLowerCase();
    return (
      !s ||
      t.name.toLowerCase().includes(s) ||
      t.reference.toLowerCase().includes(s) ||
      t.viewName.toLowerCase().includes(s) ||
      t.employer.toLowerCase().includes(s) ||
      t.category.toLowerCase().includes(s)
    );
  });

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setMsg(null);
    setUploading(true);
    try {
      const dataUrl = await readDataUrl(file);
      const res = await uploadDocxTemplate(boardId, {
        name: file.name.replace(/\.docx$/i, ""),
        fileName: file.name,
        dataUrl,
      });
      if (!res.ok) setErr(res.error ?? "Upload failed.");
      else {
        await refresh();
        setEditingId(res.id ?? null);
        setMsg(
          res.duplicateOf
            ? `Uploaded ${res.reference}. ⚠️ A template with this file name already exists — possible duplicate.`
            : `Uploaded ${res.reference} · ${res.placeholders?.length ?? 0} placeholders detected.`
        );
      }
    } catch {
      setErr("Could not read that file.");
    } finally {
      setUploading(false);
    }
  }

  function toggleSel(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function bulkActive(active: boolean) {
    const ids = [...sel];
    if (ids.length === 0) return;
    start(async () => {
      await setTemplatesActive(boardId, ids, active);
      setSel(new Set());
      await refresh();
    });
  }

  const editing = editingId ? templates.find((t) => t.id === editingId) : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">🗂 DocuGen Templates</h2>
            <p className="text-sm text-muted">
              Upload .docx templates with {"{{Placeholders}}"} — mapped to board columns, generated per item.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>

        {editing ? (
          <TemplateEditor
            boardId={boardId}
            template={editing}
            columns={data?.columns ?? []}
            fileColumns={data?.fileColumns ?? []}
            onBack={() => setEditingId(null)}
            onSaved={refresh}
          />
        ) : (
          <>
            {/* toolbar */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-60"
              >
                {uploading ? "Uploading…" : "⬆ Upload .docx"}
              </button>
              <input ref={fileRef} type="file" accept=".docx" onChange={onUpload} className="hidden" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name / ref / view / employer…"
                className="min-w-[180px] flex-1 rounded-lg border border-hair px-3 py-1.5 text-sm outline-none focus:border-teal"
              />
              <select value={folder} onChange={(e) => setFolder(e.target.value)} className="rounded-lg border border-hair px-2 py-1.5 text-sm">
                <option value="">All folders</option>
                {folders.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-body">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Show inactive
              </label>
            </div>

            {sel.size > 0 && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-canvas px-3 py-1.5 text-xs">
                <span className="font-semibold text-body">{sel.size} selected</span>
                <button onClick={() => bulkActive(true)} className="text-teal hover:underline">Activate</button>
                <button onClick={() => bulkActive(false)} className="text-teal hover:underline">Deactivate</button>
                <button onClick={() => setSel(new Set())} className="ml-auto text-muted hover:text-ink">Clear</button>
              </div>
            )}

            {err && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{err}</p>}
            {msg && <p className="mt-2 rounded-lg bg-grass/10 px-3 py-2 text-xs text-grass">{msg}</p>}

            <div className="mt-3 flex-1 overflow-auto scroll-thin">
              {!data ? (
                <p className="py-8 text-center text-sm text-muted">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="rounded-lg border border-dashed border-hair py-10 text-center text-sm text-muted">
                  No .docx templates yet — click <b>Upload .docx</b> to add one.
                </p>
              ) : (
                <div className="grid gap-2">
                  {filtered.map((t) => (
                    <div key={t.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${t.active ? "border-hair" : "border-hair bg-canvas/40 opacity-70"}`}>
                      <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleSel(t.id)} className="flex-none" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                          {t.name}
                          <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-muted">{t.reference || "—"}</span>
                          {!t.active && <span className="rounded-full bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted">inactive</span>}
                          {t.version > 1 && <span className="text-[10px] text-muted">v{t.version}</span>}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {[t.viewName, t.employer, t.folder].filter(Boolean).join(" · ") || t.docxName}
                          {" · "}{t.placeholders.length} fields
                          {t.usageCount > 0 && ` · used by ${t.usageCount} automation${t.usageCount === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <div className="flex flex-none items-center gap-2 text-xs">
                        <button onClick={() => setEditingId(t.id)} className="text-teal hover:underline">Edit</button>
                        <button onClick={() => start(async () => { await duplicateTemplate(boardId, t.id); await refresh(); })} className="text-muted hover:text-teal">Duplicate</button>
                        <button
                          onClick={() => start(async () => { await setTemplatesActive(boardId, [t.id], !t.active); await refresh(); })}
                          className="text-muted hover:text-teal"
                        >
                          {t.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => {
                            if (t.usageCount > 0 && !confirm(`"${t.name}" is used by ${t.usageCount} automation(s). Delete anyway?`)) return;
                            if (t.usageCount === 0 && !confirm(`Delete "${t.name}"?`)) return;
                            start(async () => { await deleteTemplate(boardId, t.id); await refresh(); });
                          }}
                          className="text-muted hover:text-danger"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TemplateEditor({
  boardId,
  template,
  columns,
  fileColumns,
  onBack,
  onSaved,
}: {
  boardId: string;
  template: DocuGenTemplate;
  columns: { id: string; name: string; type: string }[];
  fileColumns: { id: string; name: string }[];
  onBack: () => void;
  onSaved: () => Promise<DocuGenData | void>;
}) {
  const [name, setName] = useState(template.name);
  const [viewName, setViewName] = useState(template.viewName);
  const [reference, setReference] = useState(template.reference);
  const [employer, setEmployer] = useState(template.employer);
  const [category, setCategory] = useState(template.category);
  const [folder, setFolder] = useState(template.folder);
  const [outputFormat, setOutputFormat] = useState(template.outputFormat);
  const [outputColumnId, setOutputColumnId] = useState(template.outputColumnId ?? "");
  const [mapping, setMapping] = useState<Record<string, string>>(template.mapping);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);

  async function save() {
    setSaving(true);
    await saveTemplateMeta(boardId, template.id, {
      name, viewName, reference, employer, category, folder, mapping, outputFormat,
      outputColumnId: outputColumnId || null,
    });
    await onSaved();
    setSaving(false);
    setMsg("Saved.");
    setTimeout(() => setMsg(null), 1500);
  }

  async function onReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReplacing(true);
    const r = new FileReader();
    const dataUrl: string = await new Promise((res, rej) => { r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
    const out = await replaceTemplateFile(boardId, template.id, { fileName: file.name, dataUrl });
    setReplacing(false);
    if (!out.ok) setMsg(out.error ?? "Replace failed.");
    else { await onSaved(); setMsg(`Replaced — now v${template.version + 1}, ${out.placeholders?.length ?? 0} fields.`); }
  }

  return (
    <div className="mt-3 flex-1 overflow-auto scroll-thin">
      <button onClick={onBack} className="mb-3 text-sm text-teal hover:underline">← All templates</button>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Template name"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></Field>
        <Field label="Reference (stable ID — used by automations)"><input value={reference} onChange={(e) => setReference(e.target.value)} className={inp} /></Field>
        <Field label="DocuGen view name / number"><input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. Service Agreement View 001" className={inp} /></Field>
        <Field label="Employer"><input value={employer} onChange={(e) => setEmployer(e.target.value)} className={inp} /></Field>
        <Field label="Category / Program"><input value={category} onChange={(e) => setCategory(e.target.value)} className={inp} /></Field>
        <Field label="Folder"><input value={folder} onChange={(e) => setFolder(e.target.value)} className={inp} /></Field>
        <Field label="Output format">
          <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} className={inp}>
            <option value="docx">DOCX</option>
            <option value="pdf">PDF (converted — see note)</option>
          </select>
        </Field>
        <Field label="Save generated file to column">
          <select value={outputColumnId} onChange={(e) => setOutputColumnId(e.target.value)} className={inp}>
            <option value="">First file column (default)</option>
            {fileColumns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold text-body">Placeholder → column mapping ({template.placeholders.length})</p>
          <div>
            <button onClick={() => replaceRef.current?.click()} disabled={replacing} className="text-xs text-teal hover:underline disabled:opacity-60">
              {replacing ? "Replacing…" : "⟳ Replace .docx file"}
            </button>
            <input ref={replaceRef} type="file" accept=".docx" onChange={onReplace} className="hidden" />
          </div>
        </div>
        {template.placeholders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-hair px-3 py-3 text-xs text-muted">
            No {"{{placeholders}}"} found in this .docx. Add some (e.g. {"{{Candidate_Name}}"}) and use ⟳ Replace.
          </p>
        ) : (
          <div className="grid gap-1.5">
            {template.placeholders.map((p) => (
              <div key={p} className="flex items-center gap-2">
                <code className="w-1/2 truncate rounded bg-canvas px-2 py-1.5 font-mono text-[11px] text-teal-deep" title={p}>{"{{"}{p}{"}}"}</code>
                <span className="text-muted">→</span>
                <select
                  value={mapping[p] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [p]: e.target.value }))}
                  className={`${inp} w-1/2`}
                >
                  <option value="">(unmapped — blank)</option>
                  <option value="Item">Item name</option>
                  {columns.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {outputFormat === "pdf" && (
        <p className="mt-2 rounded-lg bg-amber/10 px-3 py-2 text-[11px] text-amber">
          PDF output is generated via a conversion step (Phase 1b). Until it&rsquo;s enabled, the file is saved as DOCX.
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {msg && <span className="mr-auto text-xs text-grass">{msg}</span>}
        <button onClick={onBack} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">Back</button>
        <button onClick={save} disabled={saving || !name.trim()} className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50">
          {saving ? "Saving…" : "Save template"}
        </button>
      </div>
    </div>
  );
}

const inp = "w-full rounded-lg border border-hair bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-teal";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-body">{label}</span>
      {children}
    </label>
  );
}
