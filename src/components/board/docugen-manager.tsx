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
  getPlaceholderList,
  getBoardItemsLite,
  docuGenConversionAvailable,
  previewTemplate,
  type DocuGenData,
  type DocuGenTemplate,
  type BoardItemLite,
} from "@/app/actions/docs";
import type { PlaceholderRow } from "@/lib/placeholders";

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function DocuGenButton({
  boardId,
  itemColumnName = "Item",
}: {
  boardId: string;
  itemColumnName?: string;
}) {
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
      {open && <DocuGenModal boardId={boardId} itemColumnName={itemColumnName} onClose={() => setOpen(false)} />}
    </>
  );
}

function DocuGenModal({
  boardId,
  itemColumnName,
  onClose,
}: {
  boardId: string;
  itemColumnName: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"templates" | "config">("templates");
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
  const [pending, start] = useTransition();

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
      <div className="relative z-10 flex h-[85vh] w-full max-w-4xl animate-rise flex-col rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">🗂 DocuGen</h2>
            <p className="text-sm text-muted">
              Templates, placeholders, and DOCX configuration — all in one place.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>

        {/* Configuration entry points consolidated into one modal (Improvement 1) */}
        <div className="mt-3 flex gap-1 border-b border-hair">
          <TabButton active={tab === "templates"} onClick={() => setTab("templates")}>
            Templates
          </TabButton>
          <TabButton active={tab === "config"} onClick={() => setTab("config")}>
            Configuration
          </TabButton>
        </div>

        {tab === "config" ? (
          <PlaceholderConfigTab boardId={boardId} itemColumnName={itemColumnName} />
        ) : editing ? (
          <TemplateEditor
            boardId={boardId}
            itemColumnName={itemColumnName}
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
                <button onClick={() => bulkActive(true)} disabled={pending} className="text-teal hover:underline disabled:opacity-60 disabled:cursor-wait">
                  {pending ? "Working…" : "Activate"}
                </button>
                <button onClick={() => bulkActive(false)} disabled={pending} className="text-teal hover:underline disabled:opacity-60 disabled:cursor-wait">
                  {pending ? "Working…" : "Deactivate"}
                </button>
                <button onClick={() => setSel(new Set())} disabled={pending} className="ml-auto text-muted hover:text-ink disabled:opacity-60">Clear</button>
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
                        <button onClick={() => setEditingId(t.id)} disabled={pending} className="text-teal hover:underline disabled:opacity-60">Edit</button>
                        <button
                          onClick={() => start(async () => { await duplicateTemplate(boardId, t.id); await refresh(); })}
                          disabled={pending}
                          className="text-muted hover:text-teal disabled:opacity-60 disabled:cursor-wait"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => start(async () => { await setTemplatesActive(boardId, [t.id], !t.active); await refresh(); })}
                          disabled={pending}
                          className="text-muted hover:text-teal disabled:opacity-60 disabled:cursor-wait"
                        >
                          {t.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => {
                            if (t.usageCount > 0 && !confirm(`"${t.name}" is used by ${t.usageCount} automation(s). Delete anyway?`)) return;
                            if (t.usageCount === 0 && !confirm(`Delete "${t.name}"?`)) return;
                            start(async () => { await deleteTemplate(boardId, t.id); await refresh(); });
                          }}
                          disabled={pending}
                          className="text-muted hover:text-danger disabled:opacity-60 disabled:cursor-wait"
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
        active ? "border-teal text-teal-deep" : "border-transparent text-muted hover:text-body"
      }`}
    >
      {children}
    </button>
  );
}

// DocuGen → Configuration tab (Improvement 1 + 2): the dedicated settings
// area the client asked for — a single place to see every board column's
// generated placeholder and copy it straight into a .docx template, instead
// of hunting through the template editor's mapping dropdowns.
function PlaceholderConfigTab({ boardId, itemColumnName }: { boardId: string; itemColumnName: string }) {
  const [rows, setRows] = useState<PlaceholderRow[] | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    getPlaceholderList(boardId).then(setRows);
  }, [boardId]);

  async function copy(placeholder: string, slug: string) {
    try {
      await navigator.clipboard.writeText(placeholder);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 1800);
    } catch {
      // Clipboard API unavailable (older browser/insecure context) — the
      // placeholder is still visible to copy manually.
    }
  }

  const filtered = (rows ?? []).filter(
    (r) => !q.trim() || r.columnName.toLowerCase().includes(q.trim().toLowerCase()) || r.placeholder.includes(q.trim().toLowerCase())
  );

  return (
    <div className="mt-3 flex-1 overflow-auto scroll-thin">
      <div className="rounded-lg border border-hair bg-canvas/40 p-3 text-xs text-body">
        <p className="font-semibold text-ink">How to use placeholders</p>
        <p className="mt-1">
          In your Word (.docx) template, type the placeholder exactly as shown (including the double
          curly braces) anywhere you want that column&rsquo;s value to appear — e.g.{" "}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-teal-deep">{"{{first_name}}"}</code>.
          Upload the file under the <b>Templates</b> tab and DocuGen fills it in automatically when a
          document is generated for an item — no manual mapping needed, though you can still remap any
          placeholder from the template&rsquo;s editor if you&rsquo;d prefer a different column.
        </p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search columns or placeholders…"
        className="mt-3 w-full rounded-lg border border-hair px-3 py-1.5 text-sm outline-none focus:border-teal"
      />

      <div className="mt-3 overflow-hidden rounded-lg border border-hair">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 border-b border-hair bg-canvas/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <span>Board column</span>
          <span>Placeholder</span>
          <span className="text-right">Copy</span>
        </div>
        {rows === null ? (
          <p className="px-3 py-6 text-center text-sm text-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted">
            {q ? "No columns match your search." : "This board has no columns yet."}
          </p>
        ) : (
          filtered.map((r) => (
            <div
              key={r.slug}
              className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 border-b border-hair px-3 py-2 text-sm last:border-b-0"
            >
              <span className="truncate text-ink" title={r.columnName}>
                {r.columnType === "name" ? `${itemColumnName} name` : r.columnName}
                {r.columnType !== "name" && (
                  <span className="ml-1.5 text-[10px] font-medium uppercase text-muted">{r.columnType}</span>
                )}
              </span>
              <code className="truncate rounded bg-canvas px-2 py-1 font-mono text-[11px] text-teal-deep" title={r.placeholder}>
                {r.placeholder}
              </code>
              <button
                onClick={() => copy(r.placeholder, r.slug)}
                className="justify-self-end rounded-lg border border-hair px-2.5 py-1 text-xs font-medium text-body hover:border-teal hover:text-teal"
              >
                {copiedSlug === r.slug ? "✓ Copied" : "Copy"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Left-menu sections inside a template editor, matching the reference
// DocuGen app's layout the client walked us through: Delivery, Placeholders,
// Item tables, Subitem tables, Template, Automation, Preview.
type EditorSection = "delivery" | "placeholders" | "itemTables" | "subitemTables" | "template" | "automation" | "preview";

const SECTION_META: { id: EditorSection; label: string; icon: string }[] = [
  { id: "delivery", label: "Delivery", icon: "📤" },
  { id: "placeholders", label: "Placeholders", icon: "🏷" },
  { id: "itemTables", label: "Item tables", icon: "▦" },
  { id: "subitemTables", label: "Subitem tables", icon: "▤" },
  { id: "template", label: "Template", icon: "📄" },
  { id: "automation", label: "Automation", icon: "⚡" },
  { id: "preview", label: "Preview", icon: "👁" },
];

function TemplateEditor({
  boardId,
  itemColumnName,
  template,
  columns,
  fileColumns,
  onBack,
  onSaved,
}: {
  boardId: string;
  itemColumnName: string;
  template: DocuGenTemplate;
  columns: { id: string; name: string; type: string }[];
  fileColumns: { id: string; name: string }[];
  onBack: () => void;
  onSaved: () => Promise<DocuGenData | void>;
}) {
  const [section, setSection] = useState<EditorSection>("delivery");
  const [name, setName] = useState(template.name);
  const [viewName, setViewName] = useState(template.viewName);
  const [reference, setReference] = useState(template.reference);
  const [employer, setEmployer] = useState(template.employer);
  const [category, setCategory] = useState(template.category);
  const [folder, setFolder] = useState(template.folder);
  const [outputFormat, setOutputFormat] = useState(template.outputFormat);
  const [outputColumnId, setOutputColumnId] = useState(template.outputColumnId ?? "");
  const [mapping, setMapping] = useState<Record<string, string>>(template.mapping);
  const [subitemColumns, setSubitemColumns] = useState<string[]>(template.subitemColumns);
  const [itemTableColumns, setItemTableColumns] = useState<string[]>(template.itemTableColumns);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const [conversionAvailable, setConversionAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    docuGenConversionAvailable().then(setConversionAvailable);
  }, []);

  // Signature anchors ({{Signature_1}} etc.) are handled by DocuSign, not mapped.
  const isSignatureAnchor = (p: string) => /^(signature|signer_name|signed_date|date_signed|initial)_?\d*$/i.test(p);
  const signaturePlaceholders = template.placeholders.filter(isSignatureAnchor);
  const dataPlaceholders = template.placeholders.filter((p) => !isSignatureAnchor(p));

  // Columns eligible to appear as a subitem-table field (skip types that
  // don't make sense in a table cell — mirrors resolveSubitemRowsForItem
  // in generate-doc.ts, the actual fill engine, so this picker never offers
  // a column the fill engine would ignore).
  const subitemEligibleTypes = new Set(["text", "longtext", "status", "person", "date", "number", "email", "phone", "url"]);
  const subitemEligibleColumns = columns.filter((c) => subitemEligibleTypes.has(c.type));

  // Columns eligible to appear as an item-table field — mirrors
  // resolveItemTableRows in generate-doc.ts exactly (adds "mirror" over the
  // subitem-eligible set, since item tables read from the item's own
  // already-resolved values and don't need to requery a related record).
  const itemTableEligibleTypes = new Set(["text", "longtext", "status", "person", "date", "number", "email", "phone", "url", "mirror"]);
  const itemTableEligibleColumns = columns.filter((c) => itemTableEligibleTypes.has(c.type));

  async function save() {
    setSaving(true);
    await saveTemplateMeta(boardId, template.id, {
      name, viewName, reference, employer, category, folder, mapping, subitemColumns, itemTableColumns, outputFormat,
      outputColumnId: outputColumnId || null,
    });
    await onSaved();
    setSaving(false);
    setMsg("✓ Template saved successfully.");
    setTimeout(() => setMsg(null), 3000);
  }

  async function onReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Warn before replacing a template that automations depend on — every
    // automation using it will send the new version on its next run.
    if (
      template.usageCount > 0 &&
      !confirm(
        `"${template.name}" is used by ${template.usageCount} automation${template.usageCount === 1 ? "" : "s"}. ` +
          `Replacing the file means those automations will use the NEW version from now on ` +
          `(the previous version is kept in version history). Continue?`
      )
    )
      return;
    setReplacing(true);
    const r = new FileReader();
    const dataUrl: string = await new Promise((res, rej) => { r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
    const out = await replaceTemplateFile(boardId, template.id, { fileName: file.name, dataUrl });
    setReplacing(false);
    if (!out.ok) setMsg(out.error ?? "Replace failed.");
    else { await onSaved(); setMsg(`Replaced — now v${template.version + 1}, ${out.placeholders?.length ?? 0} fields.`); }
  }

  return (
    <div className="relative mt-3 flex flex-1 gap-4 overflow-hidden pb-14">
      {/* Left menu — mirrors the reference DocuGen app's section list */}
      <div className="w-40 flex-none border-r border-hair pr-3">
        <button onClick={onBack} className="mb-3 text-xs text-teal hover:underline">← All templates</button>
        <p className="mb-1.5 truncate text-sm font-bold text-ink" title={template.name}>{template.name}</p>
        <div className="flex flex-col gap-0.5">
          {SECTION_META.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium ${
                section === s.id ? "bg-teal/10 text-teal-deep" : "text-body hover:bg-canvas"
              }`}
            >
              <span className="w-4 text-center">{s.icon}</span>
              {s.label}
              {s.id === "subitemTables" && template.hasSubitemsLoop && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal" title="This template uses a subitem table" />
              )}
              {s.id === "itemTables" && template.hasItemTableLoop && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal" title="This template uses an item table" />
              )}
              {s.id === "automation" && template.usageCount > 0 && (
                <span className="ml-auto rounded-full bg-canvas px-1.5 text-[10px] text-muted">{template.usageCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right content */}
      <div className="min-w-0 flex-1 overflow-auto scroll-thin pr-1">
        {msg && (
          <div className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${/fail|error|could not|invalid/i.test(msg) ? "bg-danger/10 text-danger" : "bg-grass/10 text-grass"}`}>
            {msg}
          </div>
        )}

        {section === "delivery" && (
          <div>
            <h3 className="mb-1 text-sm font-bold text-ink">Delivery</h3>
            <p className="mb-3 text-xs text-muted">Choose the file format and where the generated document is delivered.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Output format">
                <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} className={inp}>
                  <option value="docx">DOCX</option>
                  <option value="pdf">PDF{conversionAvailable === false ? " (not yet configured)" : ""}</option>
                </select>
              </Field>
              <Field label="Save generated file to column">
                <select value={outputColumnId} onChange={(e) => setOutputColumnId(e.target.value)} className={inp}>
                  <option value="">First file column (default)</option>
                  {fileColumns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </Field>
            </div>
            {outputFormat === "pdf" && conversionAvailable === false && (
              <p className="mt-3 rounded-lg bg-amber/10 px-3 py-2 text-[11px] text-amber">
                PDF conversion isn&rsquo;t configured yet — documents will be saved as DOCX until it is.
              </p>
            )}
            {fileColumns.length === 0 && (
              <p className="mt-3 rounded-lg border border-dashed border-hair px-3 py-2 text-[11px] text-muted">
                No File column on this board yet — add one to store generated documents on the item.
              </p>
            )}
          </div>
        )}

        {section === "placeholders" && (
          <div>
            <h3 className="mb-1 text-sm font-bold text-ink">Placeholder → column mapping ({template.placeholders.length})</h3>
            <p className="mb-3 text-xs text-muted">
              Every {"{{placeholder}}"} detected in the uploaded .docx, mapped to the board column that fills it.
            </p>
            {template.placeholders.length === 0 ? (
              <p className="rounded-lg border border-dashed border-hair px-3 py-3 text-xs text-muted">
                No {"{{placeholders}}"} found in this .docx. Add some (e.g. {"{{Candidate_Name}}"}) and replace the file
                under <b>Template</b>.
              </p>
            ) : (
              <>
                <div className="grid gap-1.5">
                  {dataPlaceholders.map((p) => (
                    <div key={p} className="flex items-center gap-2">
                      <code className="w-1/2 truncate rounded bg-canvas px-2 py-1.5 font-mono text-[11px] text-teal-deep" title={p}>{"{{"}{p}{"}}"}</code>
                      <span className="text-muted">→</span>
                      <select
                        value={mapping[p] ?? ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [p]: e.target.value }))}
                        className={`${inp} w-1/2`}
                      >
                        <option value="">(unmapped — blank)</option>
                        <option value="Item">{itemColumnName} name</option>
                        {columns.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                      </select>
                    </div>
                  ))}
                  {dataPlaceholders.length === 0 && (
                    <p className="text-xs text-muted">No data placeholders — only signature fields below.</p>
                  )}
                </div>

                {signaturePlaceholders.length > 0 && (
                  <div className="mt-3 rounded-lg border border-teal/30 bg-teal/5 p-2.5">
                    <p className="mb-1 text-[11px] font-semibold text-teal-deep">
                      ✍ Signature fields ({signaturePlaceholders.length}) — auto-placed in DocuSign
                    </p>
                    <p className="mb-1.5 text-[10px] text-muted">
                      These are <b>not</b> data fields. They&rsquo;re kept in the document as-is and turned into
                      DocuSign signature/date/name/initial fields automatically when sent (the number = the signer).
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {signaturePlaceholders.map((p) => (
                        <code key={p} className="rounded bg-white px-2 py-0.5 font-mono text-[11px] text-teal-deep">{"{{"}{p}{"}}"}</code>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {section === "itemTables" && (
          <div>
            <h3 className="mb-1 text-sm font-bold text-ink">Item tables</h3>
            <p className="mb-3 text-xs text-muted">
              Add <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[11px] text-teal-deep">{"{{#item_fields}}"}</code> and{" "}
              <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[11px] text-teal-deep">{"{{/item_fields}}"}</code> around a
              table row in the .docx (one in the first cell, the other in the last) to repeat that row once per
              selected {itemColumnName.toLowerCase()} field — e.g. a Field | Value table listing Name, Email, Status.
              Inside the loop use <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[11px] text-teal-deep">{"{{field}}"}</code>{" "}
              and <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[11px] text-teal-deep">{"{{value}}"}</code>.
            </p>
            {!template.hasItemTableLoop ? (
              <p className="rounded-lg border border-dashed border-hair px-3 py-3 text-xs text-muted">
                This template doesn&rsquo;t use an item table yet. Add the <code>{"{{#item_fields}}"}</code> /
                <code>{"{{/item_fields}}"}</code> tags to your .docx and replace the file under <b>Template</b> — this
                section will then let you choose which columns appear as rows.
              </p>
            ) : (
              <>
                <p className="mb-2 rounded-lg bg-teal/5 px-3 py-2 text-[11px] font-medium text-teal-deep">
                  ✓ Item table detected. Choose which columns appear as rows (leave none checked to include all
                  eligible columns).
                </p>
                <div className="grid gap-1">
                  {itemTableEligibleColumns.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-body hover:bg-canvas">
                      <input
                        type="checkbox"
                        checked={itemTableColumns.includes(c.name)}
                        onChange={(e) =>
                          setItemTableColumns((cols) =>
                            e.target.checked ? [...cols, c.name] : cols.filter((n) => n !== c.name)
                          )
                        }
                      />
                      {c.name}
                      <span className="text-[10px] text-muted">({c.type})</span>
                    </label>
                  ))}
                  {itemTableEligibleColumns.length === 0 && (
                    <p className="text-xs text-muted">No eligible columns on this board yet.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {section === "subitemTables" && (
          <div>
            <h3 className="mb-1 text-sm font-bold text-ink">Subitem tables</h3>
            <p className="mb-3 text-xs text-muted">
              Add <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[11px] text-teal-deep">{"{{#subitems}}"}</code> and{" "}
              <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[11px] text-teal-deep">{"{{/subitems}}"}</code> around a
              table row in the .docx (one in the first cell, the other in the last) to repeat that row once per
              subitem — e.g. every past endorsement grouped under this {itemColumnName.toLowerCase()}.
            </p>
            {!template.hasSubitemsLoop ? (
              <p className="rounded-lg border border-dashed border-hair px-3 py-3 text-xs text-muted">
                This template doesn&rsquo;t use a subitem table yet. Add the <code>{"{{#subitems}}"}</code> /
                <code>{"{{/subitems}}"}</code> tags to your .docx and replace the file under <b>Template</b> — this
                section will then let you choose which columns fill each row.
              </p>
            ) : (
              <>
                <p className="mb-2 rounded-lg bg-teal/5 px-3 py-2 text-[11px] font-medium text-teal-deep">
                  ✓ Subitem table detected. Choose which columns fill each repeated row (leave none checked to
                  include all eligible columns).
                </p>
                <div className="grid gap-1">
                  {subitemEligibleColumns.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-body hover:bg-canvas">
                      <input
                        type="checkbox"
                        checked={subitemColumns.includes(c.name)}
                        onChange={(e) =>
                          setSubitemColumns((cols) =>
                            e.target.checked ? [...cols, c.name] : cols.filter((n) => n !== c.name)
                          )
                        }
                      />
                      {c.name}
                      <span className="text-[10px] text-muted">({c.type})</span>
                    </label>
                  ))}
                  {subitemEligibleColumns.length === 0 && (
                    <p className="text-xs text-muted">No eligible columns on this board yet.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {section === "template" && (
          <div>
            <h3 className="mb-1 text-sm font-bold text-ink">Template</h3>
            <p className="mb-3 text-xs text-muted">Details, categorization, and the uploaded .docx file.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Template name"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></Field>
              <Field label="Reference (stable ID — used by automations)"><input value={reference} onChange={(e) => setReference(e.target.value)} className={inp} /></Field>
              <Field label="DocuGen view name / number"><input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. Service Agreement View 001" className={inp} /></Field>
              <Field label="Employer"><input value={employer} onChange={(e) => setEmployer(e.target.value)} className={inp} /></Field>
              <Field label="Category / Program"><input value={category} onChange={(e) => setCategory(e.target.value)} className={inp} /></Field>
              <Field label="Folder"><input value={folder} onChange={(e) => setFolder(e.target.value)} className={inp} /></Field>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-hair px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-body">{template.docxName || "No file"}</p>
                <p className="text-[11px] text-muted">
                  v{template.version}
                  {template.hasSubitemsLoop ? " · subitem table" : ""}
                  {template.hasItemTableLoop ? " · item table" : ""}
                </p>
              </div>
              <button onClick={() => replaceRef.current?.click()} disabled={replacing} className="flex-none text-xs text-teal hover:underline disabled:opacity-60">
                {replacing ? "Replacing…" : "⬆ Download / Upload (⟳ Replace .docx)"}
              </button>
              <input ref={replaceRef} type="file" accept=".docx" onChange={onReplace} className="hidden" />
            </div>
            {template.docxUrl && (
              <a href={template.docxUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[11px] text-teal hover:underline">
                ⬇ Download current template file
              </a>
            )}
          </div>
        )}

        {section === "automation" && (
          <div>
            <h3 className="mb-1 text-sm font-bold text-ink">Automation</h3>
            <p className="mb-3 text-xs text-muted">Automations on this board that generate documents from this template.</p>
            {template.usingAutomations.length === 0 ? (
              <p className="rounded-lg border border-dashed border-hair px-3 py-3 text-xs text-muted">
                No automation uses this template yet. Build one from the board&rsquo;s <b>⚡ Automate</b> panel with the
                &ldquo;Generate document&rdquo; action, and reference <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[11px]">{reference || template.reference}</code>.
              </p>
            ) : (
              <div className="grid gap-1.5">
                {template.usingAutomations.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg border border-hair px-3 py-2 text-sm text-body">
                    <span>⚡</span>
                    <span className="truncate">{a.name || "Untitled automation"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === "preview" && (
          <div className="flex h-full flex-col">
            <h3 className="mb-1 text-sm font-bold text-ink">Preview</h3>
            <p className="mb-3 text-xs text-muted">See how this template looks filled in with a real item&rsquo;s data.</p>
            <div className="min-h-0 flex-1">
              <TemplatePreviewPane
                boardId={boardId}
                templateId={template.id}
                conversionAvailable={conversionAvailable}
                disabled={template.placeholders.length === 0}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sticky save bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end border-t border-hair bg-white/95 px-1 py-2.5 backdrop-blur-sm">
        <div className="pointer-events-auto flex items-center gap-2">
          <button onClick={onBack} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-canvas">Back</button>
          <button onClick={save} disabled={saving || !name.trim()} className="rounded-lg bg-teal px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50">
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Visual layout preview (client walkthrough request): pick a real item and
// see the template filled with that item's data as an actual rendered PDF —
// the exact fill logic "Generate" uses, converted via the same CloudConvert
// pipeline as real PDF output, so what's previewed matches what generating
// would produce. No GeneratedDocument row is created; this is look-only.
// Embedded inline in the editor's Preview section (not a separate modal) so
// it sits alongside Delivery/Placeholders/Item tables/etc. in one place.
function TemplatePreviewPane({
  boardId,
  templateId,
  conversionAvailable,
  disabled,
}: {
  boardId: string;
  templateId: string;
  conversionAvailable: boolean | null;
  disabled: boolean;
}) {
  const [items, setItems] = useState<BoardItemLite[] | null>(null);
  const [itemId, setItemId] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getBoardItemsLite(boardId).then((rows) => {
      setItems(rows);
      if (rows[0]) setItemId(rows[0].id);
    });
  }, [boardId]);

  async function runPreview() {
    if (!itemId) return;
    setLoading(true);
    setErr(null);
    setDataUrl(null);
    const res = await previewTemplate(boardId, itemId, templateId);
    setLoading(false);
    if (res.ok) setDataUrl(res.dataUrl);
    else setErr(res.error);
  }

  if (disabled) {
    return (
      <p className="rounded-lg border border-dashed border-hair px-3 py-3 text-xs text-muted">
        Upload a .docx with placeholders first — Preview needs at least one to render.
      </p>
    );
  }

  if (conversionAvailable === false) {
    return (
      <p className="rounded-lg bg-amber/10 px-4 py-3 text-sm text-amber">
        Visual preview isn&rsquo;t configured yet — a PDF conversion API key is required to render a real preview.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-body">Preview with data from:</span>
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-hair px-2.5 py-1.5 text-sm outline-none focus:border-teal"
        >
          {items === null && <option value="">Loading items…</option>}
          {items?.length === 0 && <option value="">No items on this board</option>}
          {items?.map((it) => (
            <option key={it.id} value={it.id}>{it.name}</option>
          ))}
        </select>
        <button
          onClick={runPreview}
          disabled={!itemId || loading}
          className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
        >
          {loading ? "Rendering…" : "Render preview"}
        </button>
      </div>

      {err && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{err}</p>}

      <div className="mt-3 min-h-[300px] flex-1 overflow-hidden rounded-lg border border-hair bg-canvas/30">
        {loading ? (
          <div className="grid h-full place-items-center text-sm text-muted">Rendering preview…</div>
        ) : dataUrl ? (
          <iframe src={dataUrl} title="Template preview" className="h-full w-full" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted">
            Pick an item and click Render preview.
          </div>
        )}
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
