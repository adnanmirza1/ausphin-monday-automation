"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { StatusLabel } from "@/lib/constants";
import {
  createAutomation,
  updateAutomation,
  toggleAutomation,
  deleteAutomation,
  renameFolder,
  moveAutomation,
} from "@/app/actions/automation";
import { listDocuSignTemplates, type DsTemplateRow } from "@/app/actions/docs";

type Col = { id: string; name: string; type: string; labels: StatusLabel[] };
type Grp = { id: string; name: string; color: string };
type Dep = { id: string; name: string };
type Tpl = { id: string; name: string; reference?: string; viewName?: string; employer?: string; active?: boolean };
// Lightweight column shape for OTHER boards (destination pickers) — no
// parsed labels needed there, just enough to drive the mapping UI.
type BoardCol = { id: string; name: string; type: string };
type FieldMapping = { sourceColumnId: string; destColumnId: string };

// Rich label for a DocuGen template: Name – View – Reference – Employer.
function tplLabel(t: Tpl): string {
  return [t.name, t.viewName || null, t.reference || null, t.employer || null].filter(Boolean).join(" – ");
}
type Auto = {
  id: string;
  name: string;
  folder: string;
  position: number;
  enabled: boolean;
  trigger: string;
  action: string;
};

export function AutomationsPanel({
  boardId,
  boardName,
  itemColumnName = "Item",
  environmentName,
  columns,
  groups,
  departments,
  templates,
  boards = [],
  boardColumnsMap = {},
  automations,
}: {
  boardId: string;
  boardName: string;
  itemColumnName?: string;
  environmentName: string;
  columns: Col[];
  groups: Grp[];
  departments: Dep[];
  templates: Tpl[];
  boards?: { id: string; name: string }[];
  boardColumnsMap?: Record<string, BoardCol[]>;
  automations: Auto[];
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Auto | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, start] = useTransition();
  const statusCols = columns.filter((c) => c.type === "status");
  const personCols = columns.filter((c) => c.type === "person");
  const numberCols = columns.filter((c) => c.type === "number");
  const emailCols = columns.filter((c) => c.type === "email");
  const dateCols = columns.filter((c) => c.type === "date");

  const filtered = automations.filter(
    (a) =>
      a.name.toLowerCase().includes(q.toLowerCase()) ||
      a.folder.toLowerCase().includes(q.toLowerCase())
  );

  // group by folder, preserving each folder's internal position order
  const byFolder = useMemo(() => {
    const map = new Map<string, Auto[]>();
    for (const a of filtered) {
      const key = a.folder || "General";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // All existing folder names (for the builder's folder picker). Always offer General.
  const folderNames = useMemo(() => {
    const set = new Set<string>(["General"]);
    for (const a of automations) set.add(a.folder || "General");
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [automations]);

  function drop(targetFolder: string, beforeId: string | null) {
    if (!dragId) return;
    const id = dragId;
    setDragId(null);
    if (id === beforeId) return;
    start(() => void moveAutomation(boardId, id, targetFolder, beforeId));
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
              {environmentName} · Automations
            </p>
            <h1 className="truncate text-lg font-bold text-ink">{boardName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/boards/${boardId}`}
              className="rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas"
            >
              ← Board
            </Link>
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep"
            >
              + New automation
            </button>
          </div>
        </div>

        <div className="relative mt-3 sm:max-w-xs">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
            ⌕
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search automations & folders…"
            className="w-full rounded-lg border border-hair bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-teal"
          />
        </div>
      </header>

      <div className="flex-1 overflow-auto scroll-thin p-4 sm:p-6">
        {automations.length === 0 && <EmptyState onCreate={() => setCreating(true)} />}

        {byFolder.map(([folder, list]) => (
          <div key={folder} className="mb-6">
            <div className="group mb-2 flex items-center gap-2">
              <span className="font-mono text-xs">📁</span>
              <h2 className="text-sm font-bold text-ink">{folder}</h2>
              <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">
                {list.length}
              </span>
              <button
                onClick={() => {
                  const to = window.prompt(`Rename folder "${folder}" to:`, folder);
                  if (to && to.trim() && to !== folder)
                    start(() => void renameFolder(boardId, folder, to));
                }}
                className="hidden text-xs text-muted hover:text-teal group-hover:inline"
              >
                rename
              </button>
            </div>
            <div
              className="grid gap-2"
              onDragOver={(e) => {
                if (dragId) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(folder, null); // dropped in the folder's empty space → append
              }}
            >
              {list.map((a) => (
                <AutomationCard
                  key={a.id}
                  boardId={boardId}
                  auto={a}
                  columns={columns}
                  groups={groups}
                  departments={departments}
                  templates={templates}
                  onEdit={() => setEditing(a)}
                  dragging={dragId === a.id}
                  onDragStart={() => setDragId(a.id)}
                  onDragEnd={() => setDragId(null)}
                  onDropBefore={() => drop(folder, a.id)}
                  dragActive={!!dragId}
                />
              ))}
              {list.length === 0 && (
                <div className="rounded-lg border border-dashed border-hair px-3 py-4 text-center text-xs text-muted">
                  Drop an automation here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <CreateModal
          boardId={boardId}
          itemColumnName={itemColumnName}
          statusCols={statusCols}
          personCols={personCols}
          numberCols={numberCols}
          emailCols={emailCols}
          dateCols={dateCols}
          allColumns={columns}
          boards={boards}
          boardColumnsMap={boardColumnsMap}
          groups={groups}
          departments={departments}
          templates={templates}
          folderNames={folderNames}
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/* ── readable summary ─────────────────────────────── */
function describeTrigger(t: SafeObj, columns: Col[], groups: Grp[]) {
  const colName = (id: string) => columns.find((c) => c.id === id)?.name ?? "column";
  const label = (colId: string, id: string) =>
    columns.find((c) => c.id === colId)?.labels.find((l) => l.id === id)?.label ?? id;
  const grp = (id: string) => groups.find((g) => g.id === id)?.name ?? "group";
  if (t?.type === "item_created") return "When an item is created";
  if (t?.type === "status_changes")
    return `When ${colName(t.columnId)} changes to ${t.to === "any" ? "any status" : label(t.columnId, t.to)}`;
  if (t?.type === "column_changes")
    return `When ${colName(t.columnId)} ${t.when === "not_empty" ? "becomes non-empty" : "changes"}`;
  if (t?.type === "person_assigned") return `When a person is assigned in ${colName(t.columnId)}`;
  if (t?.type === "item_moved")
    return `When an item moves to ${t.groupId === "any" ? "any group" : `“${grp(t.groupId)}”`}`;
  return "When something happens";
}

function describeAction(a: SafeObj, columns: Col[], groups: Grp[], departments: Dep[], templates: Tpl[]) {
  const colName = (id: string) => columns.find((c) => c.id === id)?.name ?? "column";
  const label = (colId: string, id: string) =>
    columns.find((c) => c.id === colId)?.labels.find((l) => l.id === id)?.label ?? id;
  const grp = (id: string) => groups.find((g) => g.id === id)?.name ?? "group";
  const dep = (id: string) => departments.find((d) => d.id === id)?.name ?? "team";
  if (a?.type === "move_to_group") return `move it to “${grp(a.groupId)}”`;
  if (a?.type === "set_status") return `set ${colName(a.columnId)} to ${label(a.columnId, a.to)}`;
  if (a?.type === "change_column_value") {
    const col = columns.find((c) => c.id === a.columnId);
    const shown = col?.type === "status" ? label(a.columnId, a.value) : a.value;
    return `set ${colName(a.columnId)} to “${shown}”`;
  }
  if (a?.type === "notify") return `notify ${a.target === "department" ? dep(a.targetId) : "person"}`;
  if (a?.type === "assign_round_robin")
    return `assign ${colName(a.columnId)} round-robin from ${dep(a.departmentId)}`;
  if (a?.type === "generate_document") {
    const t = templates.find((x) => x.id === a.templateId);
    if (!t) return `generate a document ⚠ (template unavailable)`;
    if (t.active === false) return `generate “${t.name}” ⚠ (template deactivated)`;
    return `generate “${t.name}”`;
  }
  if (a?.type === "request_invoice")
    return `request an invoice to Finance (${a.account === "global" ? "Global" : "PTY"})`;
  if (a?.type === "send_email") return `send an email${a.subject ? ` “${a.subject}”` : ""}`;
  if (a?.type === "create_item_in_board") {
    const n = Array.isArray(a.fieldMapping) ? a.fieldMapping.length : 0;
    return `create an item in another board${n ? ` (${n} field${n === 1 ? "" : "s"} mapped)` : ""}${a.connect ? " (connected)" : ""}`;
  }
  if (a?.type === "create_subitem_by_email")
    return `create a subitem here for the matching item by email`;
  if (a?.type === "create_subitem_in_board") {
    const n = Array.isArray(a.fieldMapping) ? a.fieldMapping.length : 0;
    return `create a subitem on another board for the matching item by email${n ? ` (${n} field${n === 1 ? "" : "s"} mapped)` : ""}`;
  }
  if (a?.type === "send_docusign")
    return `send for e-signature via DocuSign${a.docusignTemplateId ? " (template)" : ""}`;
  if (a?.type === "set_date")
    return a.mode === "today"
      ? `set ${colName(a.columnId)} to today`
      : a.mode === "offset"
      ? `set ${colName(a.columnId)} to +${a.offsetDays ?? 0} days`
      : `set ${colName(a.columnId)}${a.date ? ` to ${a.date}` : ""}`;
  return "do something";
}

function describe(
  trigger: string,
  action: string,
  columns: Col[],
  groups: Grp[],
  departments: Dep[],
  templates: Tpl[]
) {
  const t = safe(trigger);
  const a = safe(action);
  const when = describeTrigger(t, columns, groups);
  const actions: SafeObj[] = a?.type === "multi" && Array.isArray(a.actions) ? a.actions : [a];
  const then = actions.map((x) => describeAction(x, columns, groups, departments, templates)).join(", then ");
  return { when, then };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SafeObj = any;
// Parse persisted trigger/action JSON (intentionally freeform shape).
function safe(s: string): SafeObj {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function AutomationCard({
  boardId,
  auto,
  columns,
  groups,
  departments,
  templates,
  onEdit,
  dragging,
  onDragStart,
  onDragEnd,
  onDropBefore,
  dragActive,
}: {
  boardId: string;
  auto: Auto;
  columns: Col[];
  groups: Grp[];
  departments: Dep[];
  templates: Tpl[];
  onEdit: () => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: () => void;
  dragActive: boolean;
}) {
  const [, start] = useTransition();
  const { when, then } = describe(auto.trigger, auto.action, columns, groups, departments, templates);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (dragActive) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!dragActive) return;
        e.preventDefault();
        e.stopPropagation();
        onDropBefore();
      }}
      className={`flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow-soft transition ${
        dragging ? "border-teal opacity-50" : "border-hair"
      } ${auto.enabled ? "" : "opacity-60"}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex-none cursor-grab select-none text-muted active:cursor-grabbing" title="Drag to reorder / change folder">
          ⠿
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{auto.name}</p>
          <p className="mt-0.5 text-xs text-body">
            <span className="font-medium text-teal-deep">{when}</span>
            <span className="text-muted"> → </span>
            <span className="font-medium text-amber">{then}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-none items-center gap-3">
        <Toggle
          on={auto.enabled}
          onChange={(v) => start(() => void toggleAutomation(boardId, auto.id, v))}
        />
        <button onClick={onEdit} className="text-xs text-teal hover:underline">
          Edit
        </button>
        <button
          onClick={() => start(() => void deleteAutomation(boardId, auto.id))}
          className="text-xs text-muted hover:text-danger"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full transition ${on ? "bg-teal" : "bg-hair"}`}
      role="switch"
      aria-checked={on}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
          on ? "left-4" : "left-0.5"
        }`}
      />
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-hair bg-white py-16 text-center">
      <div>
        <p className="text-3xl">⚡</p>
        <h3 className="mt-2 font-bold text-ink">No automations yet</h3>
        <p className="mt-1 text-sm text-muted">
          Build a “when this happens, do that” rule — no code needed.
        </p>
        <button
          onClick={onCreate}
          className="mt-4 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep"
        >
          + New automation
        </button>
      </div>
    </div>
  );
}

/* ── action draft (one THEN step) ─────────────────── */
type ActionType =
  | "move_to_group"
  | "set_status"
  | "change_column_value"
  | "notify"
  | "assign_round_robin"
  | "generate_document"
  | "request_invoice"
  | "send_email"
  | "create_item_in_board"
  | "set_date"
  | "send_docusign"
  | "create_subitem_by_email"
  | "create_subitem_in_board";

type ActionDraft = {
  key: string;
  type: ActionType;
  groupId?: string;
  statusCol?: string;
  statusTo?: string;
  ccvCol?: string;
  ccvValue?: string;
  dept?: string;
  message?: string;
  personCol?: string;
  templateId?: string;
  account?: string;
  amountCol?: string;
  emailCol?: string;
  subject?: string;
  body?: string;
  targetBoard?: string;
  connect?: boolean;
  dateCol?: string;
  dateMode?: "specific" | "today" | "offset";
  dateValue?: string;
  dateOffset?: number;
  // send_docusign
  dsFileCol?: string;
  dsEmailCol?: string;
  dsNameCol?: string;
  dsTemplateId?: string;
  dsSubject?: string;
  dsMessage?: string;
  dsStatusCol?: string;
  dsSignedCol?: string;
  // create_item_in_board / create_subitem_in_board (Automations 1 & 3):
  // dynamic source->destination column mapping, plus the source-board email
  // column to match on (subitem actions only).
  fieldMapping?: FieldMapping[];
  subEmailCol?: string;
};

let draftSeq = 0;
const draftKey = () => `d${++draftSeq}`;

// Convert a persisted Action object into an editable ActionDraft with defaults.
function toDraft(
  a: SafeObj,
  d: { groups: Grp[]; statusCols: Col[]; personCols: Col[]; numberCols: Col[]; emailCols: Col[]; dateCols: Col[]; allColumns: Col[]; boards: { id: string; name: string }[]; boardColumnsMap: Record<string, BoardCol[]>; boardId: string; departments: Dep[]; templates: Tpl[] }
): ActionDraft {
  const t: ActionType = a?.type ?? "move_to_group";
  return {
    key: draftKey(),
    type: t,
    groupId: a?.groupId ?? d.groups[0]?.id ?? "",
    statusCol: (t === "set_status" ? a?.columnId : "") || d.statusCols[0]?.id || "",
    statusTo: (t === "set_status" ? a?.to : "") || d.statusCols[0]?.labels[0]?.id || "",
    ccvCol: (t === "change_column_value" ? a?.columnId : "") || d.allColumns[0]?.id || "",
    ccvValue: t === "change_column_value" ? a?.value ?? "" : "",
    dept: a?.departmentId ?? a?.targetId ?? d.departments[0]?.id ?? "",
    message: a?.message ?? "",
    personCol: (t === "assign_round_robin" ? a?.columnId : "") || d.personCols[0]?.id || "",
    templateId: a?.templateId ?? d.templates[0]?.id ?? "",
    account: a?.account ?? "pty",
    amountCol: a?.amountColumnId ?? d.numberCols[0]?.id ?? "",
    emailCol: (t === "send_email" ? a?.toColumnId : "") || d.emailCols[0]?.id || d.allColumns.find((c) => c.type === "email")?.id || "",
    subject: t === "send_email" ? a?.subject ?? "" : "",
    body: t === "send_email" ? a?.body ?? "" : "",
    targetBoard:
      (t === "create_item_in_board" || t === "create_subitem_in_board" ? a?.boardId : "") ||
      d.boards.find((b) => b.id !== d.boardId)?.id ||
      "",
    connect: t === "create_item_in_board" ? !!a?.connect : true,
    dateCol: (t === "set_date" ? a?.columnId : "") || d.dateCols[0]?.id || "",
    dateMode: t === "set_date" ? a?.mode ?? "specific" : "specific",
    dateValue: t === "set_date" ? a?.date ?? "" : "",
    dateOffset: t === "set_date" ? a?.offsetDays ?? 7 : 7,
    dsFileCol: (t === "send_docusign" ? a?.fileColumnId : "") || d.allColumns.find((c) => c.type === "file")?.id || "",
    dsEmailCol: (t === "send_docusign" ? a?.recipientEmailColumnId : "") || d.emailCols[0]?.id || "",
    dsNameCol: (t === "send_docusign" ? a?.recipientNameColumnId : "") || "",
    dsTemplateId: t === "send_docusign" ? a?.docusignTemplateId ?? "" : "",
    dsSubject: t === "send_docusign" ? a?.subject ?? "" : "",
    dsMessage: t === "send_docusign" ? a?.message ?? "" : "",
    dsStatusCol: (t === "send_docusign" ? a?.statusColumnId : "") || "",
    dsSignedCol: (t === "send_docusign" ? a?.signedColumnId : "") || "",
    fieldMapping:
      (t === "create_item_in_board" || t === "create_subitem_in_board") && Array.isArray(a?.fieldMapping)
        ? a.fieldMapping
        : [],
    subEmailCol:
      (t === "create_subitem_by_email" || t === "create_subitem_in_board" ? a?.emailColumnId : "") ||
      d.emailCols[0]?.id ||
      "",
  };
}

// Build the persisted Action object from a draft.
function buildAction(a: ActionDraft): Record<string, unknown> {
  switch (a.type) {
    case "move_to_group":
      return { type: "move_to_group", groupId: a.groupId };
    case "set_status":
      return { type: "set_status", columnId: a.statusCol, to: a.statusTo };
    case "change_column_value":
      return { type: "change_column_value", columnId: a.ccvCol, value: a.ccvValue ?? "" };
    case "notify":
      return { type: "notify", target: "department", targetId: a.dept, message: a.message ?? "" };
    case "assign_round_robin":
      return { type: "assign_round_robin", columnId: a.personCol, departmentId: a.dept };
    case "generate_document":
      return { type: "generate_document", templateId: a.templateId };
    case "request_invoice":
      return { type: "request_invoice", account: a.account, amountColumnId: a.amountCol || undefined };
    case "send_email":
      return { type: "send_email", toColumnId: a.emailCol || undefined, subject: a.subject ?? "", body: a.body ?? "" };
    case "create_item_in_board":
      return {
        type: "create_item_in_board",
        boardId: a.targetBoard,
        connect: a.connect,
        fieldMapping: (a.fieldMapping ?? []).filter((m) => m.sourceColumnId && m.destColumnId),
      };
    case "create_subitem_by_email":
      return { type: "create_subitem_by_email", emailColumnId: a.subEmailCol || undefined };
    case "create_subitem_in_board":
      return {
        type: "create_subitem_in_board",
        boardId: a.targetBoard,
        emailColumnId: a.subEmailCol || undefined,
        fieldMapping: (a.fieldMapping ?? []).filter((m) => m.sourceColumnId && m.destColumnId),
      };
    case "set_date":
      return {
        type: "set_date",
        columnId: a.dateCol,
        mode: a.dateMode,
        ...(a.dateMode === "specific" ? { date: a.dateValue } : {}),
        ...(a.dateMode === "offset" ? { offsetDays: Number(a.dateOffset) || 0 } : {}),
      };
    case "send_docusign":
      return {
        type: "send_docusign",
        fileColumnId: a.dsFileCol || undefined,
        recipientEmailColumnId: a.dsEmailCol || undefined,
        recipientNameColumnId: a.dsNameCol || undefined,
        docusignTemplateId: a.dsTemplateId || undefined,
        subject: a.dsSubject ?? "",
        message: a.dsMessage ?? "",
        statusColumnId: a.dsStatusCol || undefined,
        signedColumnId: a.dsSignedCol || undefined,
      };
    default:
      return { type: "move_to_group", groupId: a.groupId };
  }
}

/* ── create modal (builder) ───────────────────────── */
function CreateModal({
  boardId,
  itemColumnName,
  statusCols,
  personCols,
  numberCols,
  emailCols,
  dateCols,
  allColumns,
  boards,
  boardColumnsMap,
  groups,
  departments,
  templates,
  folderNames,
  existing,
  onClose,
}: {
  boardId: string;
  itemColumnName: string;
  statusCols: Col[];
  personCols: Col[];
  numberCols: Col[];
  emailCols: Col[];
  dateCols: Col[];
  allColumns: Col[];
  boards: { id: string; name: string }[];
  boardColumnsMap: Record<string, BoardCol[]>;
  groups: Grp[];
  departments: Dep[];
  templates: Tpl[];
  folderNames: string[];
  existing?: Auto | null;
  onClose: () => void;
}) {
  const et = safe(existing?.trigger ?? "{}") ?? {};
  const ea = safe(existing?.action ?? "{}") ?? {};
  const draftDeps = { groups, statusCols, personCols, numberCols, emailCols, dateCols, allColumns, boards, boardColumnsMap, boardId, departments, templates };

  const [name, setName] = useState(existing?.name ?? "");
  const [folder, setFolder] = useState(existing?.folder || "General");
  const [newFolder, setNewFolder] = useState(false);
  const [, start] = useTransition();

  // trigger state
  const [tType, setTType] = useState<
    "item_created" | "status_changes" | "column_changes" | "person_assigned" | "item_moved"
  >(et.type ?? "status_changes");
  const [tCol, setTCol] = useState(et.columnId ?? statusCols[0]?.id ?? "");
  const [tTo, setTTo] = useState(et.to ?? "any");
  const [tWhen, setTWhen] = useState<"any" | "not_empty">(et.when ?? "any");
  const [tGroup, setTGroup] = useState(et.groupId ?? "any");

  // actions state — one or more THEN steps
  const initialActions: SafeObj[] =
    ea?.type === "multi" && Array.isArray(ea.actions) ? ea.actions : existing ? [ea] : [{ type: "move_to_group" }];
  const [actions, setActions] = useState<ActionDraft[]>(
    initialActions.map((a) => toDraft(a, draftDeps))
  );

  const tColObj = statusCols.find((c) => c.id === tCol);

  function patchAction(key: string, patch: Partial<ActionDraft>) {
    setActions((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }
  function addAction() {
    setActions((list) => [...list, toDraft({ type: "move_to_group" }, draftDeps)]);
  }
  function removeAction(key: string) {
    setActions((list) => (list.length <= 1 ? list : list.filter((a) => a.key !== key)));
  }

  function build() {
    let trigger: Record<string, unknown>;
    switch (tType) {
      case "item_created":
        trigger = { type: "item_created" };
        break;
      case "status_changes":
        trigger = { type: "status_changes", columnId: tCol, to: tTo };
        break;
      case "column_changes":
        trigger = { type: "column_changes", columnId: tCol, when: tWhen };
        break;
      case "person_assigned":
        trigger = { type: "person_assigned", columnId: tCol };
        break;
      case "item_moved":
        trigger = { type: "item_moved", groupId: tGroup };
        break;
      default:
        trigger = { type: "item_created" };
    }

    const built = actions.map(buildAction);
    // Backward-compatible: store a single action directly, else a multi wrapper.
    const action = built.length === 1 ? built[0] : { type: "multi", actions: built };
    const finalFolder = folder === "General" ? "" : folder.trim();
    const input = { name, folder: finalFolder, trigger, action };
    start(() =>
      existing
        ? void updateAutomation(boardId, existing.id, input)
        : void createAutomation(boardId, input)
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <h2 className="text-lg font-bold text-ink">{existing ? "Edit automation" : "New automation"}</h2>
        <p className="mt-0.5 text-sm text-muted">Define a trigger and one or more actions.</p>

        <div className="mt-4 grid gap-3 overflow-y-auto scroll-thin pr-0.5">
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Move to Contacting" className={inp} />
            </Labeled>
            <Labeled label="Folder">
              {newFolder ? (
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    placeholder="New folder name"
                    className={inp}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setNewFolder(false);
                      setFolder(existing?.folder || "General");
                    }}
                    className="flex-none rounded-lg border border-hair px-2 text-xs text-muted hover:bg-canvas"
                    title="Cancel new folder"
                  >
                    ↩
                  </button>
                </div>
              ) : (
                <select
                  value={folderNames.includes(folder) ? folder : "General"}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setNewFolder(true);
                      setFolder("");
                    } else setFolder(e.target.value);
                  }}
                  className={inp}
                >
                  {folderNames.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                  <option value="__new__">➕ New folder…</option>
                </select>
              )}
            </Labeled>
          </div>

          {/* WHEN */}
          <div className="rounded-xl border border-hair bg-canvas/50 p-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-teal-deep">When</p>
            <select value={tType} onChange={(e) => setTType(e.target.value as typeof tType)} className={inp}>
              <option value="status_changes">A status changes</option>
              <option value="item_created">An item is created</option>
              <option value="column_changes">A column changes</option>
              <option value="person_assigned">A person is assigned</option>
              <option value="item_moved">An item moves to a group</option>
            </select>
            {tType === "status_changes" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select value={tCol} onChange={(e) => setTCol(e.target.value)} className={inp}>
                  {statusCols.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select value={tTo} onChange={(e) => setTTo(e.target.value)} className={inp}>
                  <option value="any">to any status</option>
                  {tColObj?.labels.map((l) => (
                    <option key={l.id} value={l.id}>to “{l.label}”</option>
                  ))}
                </select>
              </div>
            )}
            {tType === "column_changes" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select value={tCol} onChange={(e) => setTCol(e.target.value)} className={inp}>
                  {allColumns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select value={tWhen} onChange={(e) => setTWhen(e.target.value as "any" | "not_empty")} className={inp}>
                  <option value="any">on any change</option>
                  <option value="not_empty">when it becomes non-empty</option>
                </select>
              </div>
            )}
            {tType === "person_assigned" && (
              <select value={tCol} onChange={(e) => setTCol(e.target.value)} className={`${inp} mt-2`}>
                {personCols.length === 0 && <option value="">No person column</option>}
                {personCols.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {tType === "item_moved" && (
              <select value={tGroup} onChange={(e) => setTGroup(e.target.value)} className={`${inp} mt-2`}>
                <option value="any">to any group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>to “{g.name}”</option>
                ))}
              </select>
            )}
          </div>

          {/* THEN — one block per action */}
          {actions.map((a, i) => (
            <div key={a.key} className="rounded-xl border border-hair bg-canvas/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-widest text-amber">
                  {i === 0 ? "Then" : "And then"}
                </p>
                {actions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAction(a.key)}
                    className="text-xs text-muted hover:text-danger"
                  >
                    ✕ Remove
                  </button>
                )}
              </div>
              <ActionEditor
                a={a}
                onPatch={(patch) => patchAction(a.key, patch)}
                itemColumnName={itemColumnName}
                statusCols={statusCols}
                personCols={personCols}
                numberCols={numberCols}
                emailCols={emailCols}
                dateCols={dateCols}
                allColumns={allColumns}
                boards={boards}
                boardColumnsMap={boardColumnsMap}
                boardId={boardId}
                groups={groups}
                departments={departments}
                templates={templates}
              />
            </div>
          ))}

          <button
            type="button"
            onClick={addAction}
            className="rounded-lg border border-dashed border-hair px-3 py-2 text-xs font-semibold text-teal hover:border-teal hover:bg-teal/5"
          >
            + Add action
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">
            Cancel
          </button>
          <button
            onClick={build}
            disabled={!name.trim()}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            {existing ? "Save changes" : "Create automation"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── one THEN action's fields ─────────────────────── */
function ActionEditor({
  a,
  onPatch,
  itemColumnName,
  statusCols,
  personCols,
  numberCols,
  emailCols,
  dateCols,
  allColumns,
  boards,
  boardColumnsMap,
  boardId,
  groups,
  departments,
  templates,
}: {
  a: ActionDraft;
  onPatch: (patch: Partial<ActionDraft>) => void;
  itemColumnName: string;
  statusCols: Col[];
  personCols: Col[];
  numberCols: Col[];
  emailCols: Col[];
  dateCols: Col[];
  allColumns: Col[];
  boards: { id: string; name: string }[];
  boardColumnsMap: Record<string, BoardCol[]>;
  boardId: string;
  groups: Grp[];
  departments: Dep[];
  templates: Tpl[];
}) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [focusField, setFocusField] = useState<"subject" | "body">("body");

  function insertPlaceholder(token: string) {
    const wrapped = `{{${token}}}`;
    const isSubject = focusField === "subject";
    const el = isSubject ? subjectRef.current : bodyRef.current;
    const cur = (isSubject ? a.subject : a.body) ?? "";
    const startPos = el?.selectionStart ?? cur.length;
    const endPos = el?.selectionEnd ?? cur.length;
    const next = cur.slice(0, startPos) + wrapped + cur.slice(endPos);
    onPatch(isSubject ? { subject: next } : { body: next });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = startPos + wrapped.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const placeholderTokens = ["Item", ...allColumns.map((c) => c.name).filter((n, i, arr) => arr.indexOf(n) === i)];
  const ccvColObj = allColumns.find((c) => c.id === a.ccvCol);
  const aStatusColObj = statusCols.find((c) => c.id === a.statusCol);

  return (
    <>
      <select value={a.type} onChange={(e) => onPatch({ type: e.target.value as ActionType })} className={inp}>
        <option value="move_to_group">Move item to group</option>
        <option value="set_status">Set a status</option>
        <option value="change_column_value">Change a column value</option>
        <option value="notify">Notify a department</option>
        <option value="assign_round_robin">Assign person (round robin)</option>
        <option value="generate_document">Generate a document</option>
        <option value="request_invoice">Request an invoice (to Finance)</option>
        <option value="send_email">Send an email</option>
        <option value="create_item_in_board">Create item in another board</option>
        <option value="create_subitem_by_email">Create subitem here (match by email)</option>
        <option value="create_subitem_in_board">Create subitem in another board (match by email)</option>
        <option value="set_date">Set a date</option>
        <option value="send_docusign">Send for e-signature (DocuSign)</option>
      </select>

      {a.type === "move_to_group" && (
        <select value={a.groupId} onChange={(e) => onPatch({ groupId: e.target.value })} className={`${inp} mt-2`}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      )}

      {a.type === "set_status" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            value={a.statusCol}
            onChange={(e) => {
              const c = statusCols.find((x) => x.id === e.target.value);
              onPatch({ statusCol: e.target.value, statusTo: c?.labels[0]?.id ?? "" });
            }}
            className={inp}
          >
            {statusCols.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={a.statusTo} onChange={(e) => onPatch({ statusTo: e.target.value })} className={inp}>
            {aStatusColObj?.labels.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </div>
      )}

      {a.type === "change_column_value" && (
        <div className="mt-2 grid gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-body">Which column?</label>
            <select
              value={a.ccvCol}
              onChange={(e) => {
                const c = allColumns.find((x) => x.id === e.target.value);
                onPatch({ ccvCol: e.target.value, ccvValue: c?.type === "status" ? c.labels[0]?.id ?? "" : "" });
              }}
              className={inp}
            >
              {allColumns.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-body">New value</label>
            {ccvColObj?.type === "status" ? (
              <select value={a.ccvValue} onChange={(e) => onPatch({ ccvValue: e.target.value })} className={inp}>
                {ccvColObj.labels.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            ) : (
              <input
                value={a.ccvValue ?? ""}
                onChange={(e) => onPatch({ ccvValue: e.target.value })}
                placeholder={ccvColObj?.type === "email" ? "name@email.com" : "Value to set"}
                className={inp}
              />
            )}
          </div>
        </div>
      )}

      {a.type === "notify" && (
        <div className="mt-2 grid gap-2">
          <select value={a.dept} onChange={(e) => onPatch({ dept: e.target.value })} className={inp}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <input value={a.message ?? ""} onChange={(e) => onPatch({ message: e.target.value })} placeholder="Message…" className={inp} />
        </div>
      )}

      {a.type === "assign_round_robin" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select value={a.personCol} onChange={(e) => onPatch({ personCol: e.target.value })} className={inp}>
            {personCols.length === 0 && <option value="">No person column</option>}
            {personCols.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={a.dept} onChange={(e) => onPatch({ dept: e.target.value })} className={inp}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      {a.type === "generate_document" && (
        <DocuGenPicker a={a} onPatch={onPatch} templates={templates} />
      )}

      {a.type === "request_invoice" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select value={a.account} onChange={(e) => onPatch({ account: e.target.value })} className={inp}>
            <option value="pty">Osphine PTY</option>
            <option value="global">Osphine Global</option>
          </select>
          <select value={a.amountCol} onChange={(e) => onPatch({ amountCol: e.target.value })} className={inp}>
            <option value="">Amount: none</option>
            {numberCols.map((c) => (
              <option key={c.id} value={c.id}>Amount: {c.name}</option>
            ))}
          </select>
        </div>
      )}

      {a.type === "send_email" && (
        <div className="mt-2 grid gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-body">Send to (column holding the email)</label>
            <select value={a.emailCol} onChange={(e) => onPatch({ emailCol: e.target.value })} className={inp}>
              <option value="">First email column on the item</option>
              {/* Any column can hold the address (e.g. a text "Approver Email"). */}
              {allColumns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.type === "email" ? "" : ` (${c.type})`}
                </option>
              ))}
            </select>
          </div>
          <input
            ref={subjectRef}
            value={a.subject ?? ""}
            onChange={(e) => onPatch({ subject: e.target.value })}
            onFocus={() => setFocusField("subject")}
            placeholder="Subject — e.g. Welcome {{Item}}!"
            className={inp}
          />
          <textarea
            ref={bodyRef}
            value={a.body ?? ""}
            onChange={(e) => onPatch({ body: e.target.value })}
            onFocus={() => setFocusField("body")}
            rows={4}
            placeholder={"Body — use the chips below to insert live data.\n\nHi {{Item}},\nThank you for registering."}
            className={`${inp} resize-y`}
          />
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Insert data into {focusField === "subject" ? "subject" : "body"}
            </p>
            <div className="flex flex-wrap gap-1">
              {placeholderTokens.map((t) => (
                <button
                  key={t}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertPlaceholder(t)}
                  className="rounded-full border border-hair px-2 py-0.5 text-[11px] font-medium text-teal hover:border-teal hover:bg-teal/5"
                  title={`Insert {{${t}}}`}
                >
                  + {t === "Item" ? `${itemColumnName} name` : t}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-hair bg-white p-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Preview (sample data)</p>
            <p className="text-xs font-semibold text-ink">{previewText(a.subject ?? "") || "(no subject)"}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-body">{previewText(a.body ?? "") || "(empty body)"}</p>
          </div>
        </div>
      )}

      {a.type === "create_item_in_board" && (
        <div className="mt-2 grid gap-2">
          <select value={a.targetBoard} onChange={(e) => onPatch({ targetBoard: e.target.value })} className={inp}>
            {boards.filter((b) => b.id !== boardId).length === 0 && <option value="">No other boards</option>}
            {boards.filter((b) => b.id !== boardId).map((b) => (
              <option key={b.id} value={b.id}>Create in: {b.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={!!a.connect} onChange={(e) => onPatch({ connect: e.target.checked })} />
            Connect the two items (enables mirror columns)
          </label>
          <FieldMappingEditor
            sourceColumns={allColumns}
            destColumns={boardColumnsMap[a.targetBoard ?? ""] ?? []}
            mapping={a.fieldMapping ?? []}
            onChange={(fieldMapping) => onPatch({ fieldMapping })}
            emptyHint="No mapping configured — the item's name and email (if any) will be copied by default."
          />
        </div>
      )}

      {a.type === "create_subitem_by_email" && (
        <div className="mt-2 grid gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-body">
              Match using this email column
            </label>
            <select value={a.subEmailCol} onChange={(e) => onPatch({ subEmailCol: e.target.value })} className={inp}>
              <option value="">Board&rsquo;s first email column</option>
              {emailCols.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {emailCols.length === 0 && (
              <p className="mt-1 text-[11px] text-amber">
                This board has no email column yet — add one to use this action.
              </p>
            )}
          </div>
          <p className="text-[11px] text-muted">
            When the trigger fires, this item is moved under the existing item on this board whose
            email matches (case-insensitive, whitespace-trimmed) — no duplicate main item is created.
          </p>
        </div>
      )}

      {a.type === "create_subitem_in_board" && (
        <div className="mt-2 grid gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-body">Destination board</label>
            <select value={a.targetBoard} onChange={(e) => onPatch({ targetBoard: e.target.value })} className={inp}>
              {boards.filter((b) => b.id !== boardId).length === 0 && <option value="">No other boards</option>}
              {boards.filter((b) => b.id !== boardId).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-body">
              Match using this email column (on this board)
            </label>
            <select value={a.subEmailCol} onChange={(e) => onPatch({ subEmailCol: e.target.value })} className={inp}>
              <option value="">Board&rsquo;s first email column</option>
              {emailCols.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-muted">
            Finds the item on the destination board whose email matches this one, and adds this
            record as a subitem underneath it — never a duplicate main item.
          </p>
          <FieldMappingEditor
            sourceColumns={allColumns}
            destColumns={boardColumnsMap[a.targetBoard ?? ""] ?? []}
            mapping={a.fieldMapping ?? []}
            onChange={(fieldMapping) => onPatch({ fieldMapping })}
            emptyHint="No mapping configured — only the matched email will be copied onto the subitem."
          />
        </div>
      )}

      {a.type === "set_date" && (
        <div className="mt-2 grid gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-body">Date column to update</label>
            <select value={a.dateCol} onChange={(e) => onPatch({ dateCol: e.target.value })} className={inp}>
              {dateCols.length === 0 && <option value="">No date column on this board</option>}
              {dateCols.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-body">Set to</label>
            <select value={a.dateMode} onChange={(e) => onPatch({ dateMode: e.target.value as "specific" | "today" | "offset" })} className={inp}>
              <option value="specific">A specific date</option>
              <option value="today">Today (when it runs)</option>
              <option value="offset">In N days from today</option>
            </select>
          </div>
          {a.dateMode === "specific" && (
            <input type="date" value={a.dateValue ?? ""} onChange={(e) => onPatch({ dateValue: e.target.value })} className={inp} />
          )}
          {a.dateMode === "offset" && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={a.dateOffset ?? 7}
                onChange={(e) => onPatch({ dateOffset: Number(e.target.value) })}
                className={`${inp} w-24`}
              />
              <span className="text-sm text-muted">days from today</span>
            </div>
          )}
          {dateCols.length === 0 && (
            <p className="text-xs text-amber">Add a Date column to the board to use this action.</p>
          )}
        </div>
      )}

      {a.type === "send_docusign" && (
        <div className="mt-2 grid gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-body">Recipient email (column)</label>
            <select value={a.dsEmailCol} onChange={(e) => onPatch({ dsEmailCol: e.target.value })} className={inp}>
              <option value="">First email column</option>
              {allColumns.map((c) => (<option key={c.id} value={c.id}>{c.name}{c.type === "email" ? "" : ` (${c.type})`}</option>))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-body">Recipient name (column)</label>
            <select value={a.dsNameCol} onChange={(e) => onPatch({ dsNameCol: e.target.value })} className={inp}>
              <option value="">{itemColumnName} name</option>
              {allColumns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-body">DocuSign template (optional)</label>
            <DsTemplatePicker value={a.dsTemplateId ?? ""} onChange={(v) => onPatch({ dsTemplateId: v })} />
            <p className="mt-1 text-[10px] text-muted">Leave blank to send the document from the file column below (with auto {"{{Signature_N}}"} fields).</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-body">Document to send (file column)</label>
            <select value={a.dsFileCol} onChange={(e) => onPatch({ dsFileCol: e.target.value })} className={inp} disabled={!!a.dsTemplateId}>
              <option value="">First file column (latest file)</option>
              {allColumns.filter((c) => c.type === "file").map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <input value={a.dsSubject ?? ""} onChange={(e) => onPatch({ dsSubject: e.target.value })} placeholder="Email subject — e.g. Please sign: {{Item}}" className={inp} />
          <textarea value={a.dsMessage ?? ""} onChange={(e) => onPatch({ dsMessage: e.target.value })} rows={2} placeholder="Message to the signer (optional)" className={`${inp} resize-y`} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-body">Write status to (column)</label>
              <select value={a.dsStatusCol} onChange={(e) => onPatch({ dsStatusCol: e.target.value })} className={inp}>
                <option value="">— none —</option>
                {allColumns.filter((c) => c.type === "status" || c.type === "text").map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-body">Signed file → (file column)</label>
              <select value={a.dsSignedCol} onChange={(e) => onPatch({ dsSignedCol: e.target.value })} className={inp}>
                <option value="">— none —</option>
                {allColumns.filter((c) => c.type === "file").map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Searchable DocuSign template picker — lazy-loads templates from the connected
// account (empty until DocuSign is connected).
function DsTemplatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [templates, setTemplates] = useState<DsTemplateRow[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    listDocuSignTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);
  if (templates === null) return <p className="text-xs text-muted">Loading DocuSign templates…</p>;
  if (templates.length === 0)
    return (
      <select value="" disabled className={inp}>
        <option value="">No DocuSign templates (connect DocuSign in Settings)</option>
      </select>
    );
  const s = q.toLowerCase();
  const shown = templates.filter((t) => !s || t.name.toLowerCase().includes(s) || t.templateId.toLowerCase().includes(s));
  return (
    <div className="grid gap-1.5">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search DocuSign templates…" className={inp} />
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inp}>
        <option value="">— none (send document instead) —</option>
        {value && !templates.some((t) => t.templateId === value) && (
          <option value={value}>⚠ Unavailable template (id kept)</option>
        )}
        {shown.map((t) => (<option key={t.templateId} value={t.templateId}>{t.name} — {t.templateId.slice(0, 8)}</option>))}
      </select>
    </div>
  );
}

// Searchable DocuGen template picker (A2): shows Name – View – Ref – Employer,
// only offers ACTIVE templates for new selection, and keeps a now-unavailable
// stored template visible with a warning so the automation still shows its intent.
function DocuGenPicker({
  a,
  onPatch,
  templates,
}: {
  a: ActionDraft;
  onPatch: (patch: Partial<ActionDraft>) => void;
  templates: Tpl[];
}) {
  const [q, setQ] = useState("");
  const active = templates.filter((t) => t.active !== false);
  const current = templates.find((t) => t.id === a.templateId);
  const unavailable = !!a.templateId && !current;
  const deactivated = !!current && current.active === false;
  const s = q.toLowerCase();
  const shown = active.filter((t) => !s || tplLabel(t).toLowerCase().includes(s));

  return (
    <div className="mt-2 grid gap-1.5">
      {templates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hair px-3 py-2 text-xs text-muted">
          No templates yet — upload one via 🗂 DocuGen on the board.
        </p>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search templates by name / view / ref / employer…"
            className={inp}
          />
          <select value={a.templateId ?? ""} onChange={(e) => onPatch({ templateId: e.target.value })} className={inp}>
            <option value="">Select a template…</option>
            {/* Keep a deactivated/deleted stored template visible + flagged. */}
            {deactivated && current && <option value={current.id}>{tplLabel(current)} (deactivated)</option>}
            {unavailable && <option value={a.templateId}>⚠ Unavailable template (id kept)</option>}
            {shown.map((t) => (
              <option key={t.id} value={t.id}>{tplLabel(t)}</option>
            ))}
          </select>
          {unavailable && (
            <p className="text-[11px] text-danger">⚠ The selected template was deleted. Pick another before this runs.</p>
          )}
          {deactivated && (
            <p className="text-[11px] text-amber">⚠ This template is deactivated and won&rsquo;t generate until reactivated.</p>
          )}
        </>
      )}
    </div>
  );
}

// Flexible source-column -> destination-column mapping (Automations 1 & 3).
// Mirrors the CSV import mapping pattern (src/components/board/data-io.tsx):
// one row per source column, a dropdown to pick the destination column or
// skip it. Options are generated dynamically from each board's actual
// columns — never hardcoded — and the destination list is filtered to types
// that can sensibly receive a value (mirrors ImportModal's exclusions).
function FieldMappingEditor({
  sourceColumns,
  destColumns,
  mapping,
  onChange,
  emptyHint,
}: {
  sourceColumns: Col[];
  destColumns: BoardCol[];
  mapping: FieldMapping[];
  onChange: (m: FieldMapping[]) => void;
  emptyHint: string;
}) {
  const destOptions = destColumns.filter((c) => !["connection", "mirror", "signature", "file"].includes(c.type));

  function destFor(sourceColumnId: string): string {
    return mapping.find((m) => m.sourceColumnId === sourceColumnId)?.destColumnId ?? "";
  }
  function setDest(sourceColumnId: string, destColumnId: string) {
    const rest = mapping.filter((m) => m.sourceColumnId !== sourceColumnId);
    onChange(destColumnId ? [...rest, { sourceColumnId, destColumnId }] : rest);
  }

  if (destColumns.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-hair px-3 py-2 text-xs text-muted">
        Select a destination board above to map fields.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-hair bg-white p-2.5">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        Field mapping (optional)
      </p>
      <div className="space-y-1.5">
        {sourceColumns.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <span className="w-1/3 truncate text-xs text-body" title={c.name}>{c.name}</span>
            <span className="text-muted">→</span>
            <select
              value={destFor(c.id)}
              onChange={(e) => setDest(c.id, e.target.value)}
              className="flex-1 rounded-lg border border-hair px-2 py-1.5 text-sm outline-none focus:border-teal"
            >
              <option value="">— Skip —</option>
              {destOptions.map((dc) => (
                <option key={dc.id} value={dc.id}>{dc.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {mapping.length === 0 && <p className="mt-1.5 text-[11px] text-muted">{emptyHint}</p>}
    </div>
  );
}

// Substitute {{placeholders}} with sample values for the email preview.
function previewText(t: string): string {
  const samples: Record<string, string> = {
    item: "Maverick Estacio",
    name: "Maverick Estacio",
    email: "maverick@example.com",
    program: "SAP 400",
    phone: "+61 400 000 000",
    status: "New",
    owner: "Gem Cruz",
  };
  return t.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => samples[String(k).toLowerCase()] ?? `[${String(k).trim()}]`);
}

const inp =
  "w-full rounded-lg border border-hair bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-teal";

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-body">{label}</span>
      {children}
    </label>
  );
}
