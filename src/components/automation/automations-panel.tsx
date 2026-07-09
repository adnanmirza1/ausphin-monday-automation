"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { StatusLabel } from "@/lib/constants";
import {
  createAutomation,
  updateAutomation,
  toggleAutomation,
  deleteAutomation,
  renameFolder,
} from "@/app/actions/automation";

type Col = { id: string; name: string; type: string; labels: StatusLabel[] };
type Grp = { id: string; name: string; color: string };
type Dep = { id: string; name: string };
type Tpl = { id: string; name: string };
type Auto = {
  id: string;
  name: string;
  folder: string;
  enabled: boolean;
  trigger: string;
  action: string;
};

export function AutomationsPanel({
  boardId,
  boardName,
  environmentName,
  columns,
  groups,
  departments,
  templates,
  boards = [],
  automations,
}: {
  boardId: string;
  boardName: string;
  environmentName: string;
  columns: Col[];
  groups: Grp[];
  departments: Dep[];
  templates: Tpl[];
  boards?: { id: string; name: string }[];
  automations: Auto[];
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Auto | null>(null);
  const [, start] = useTransition();
  const statusCols = columns.filter((c) => c.type === "status");
  const personCols = columns.filter((c) => c.type === "person");
  const numberCols = columns.filter((c) => c.type === "number");
  const emailCols = columns.filter((c) => c.type === "email");

  const filtered = automations.filter(
    (a) =>
      a.name.toLowerCase().includes(q.toLowerCase()) ||
      a.folder.toLowerCase().includes(q.toLowerCase())
  );

  // group by folder
  const byFolder = useMemo(() => {
    const map = new Map<string, Auto[]>();
    for (const a of filtered) {
      const key = a.folder || "General";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

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
        {automations.length === 0 && (
          <EmptyState onCreate={() => setCreating(true)} />
        )}

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
            <div className="grid gap-2">
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
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <CreateModal
          boardId={boardId}
          statusCols={statusCols}
          personCols={personCols}
          numberCols={numberCols}
          emailCols={emailCols}
          allColumns={columns}
          boards={boards}
          groups={groups}
          departments={departments}
          templates={templates}
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
  const colName = (id: string) => columns.find((c) => c.id === id)?.name ?? "column";
  const label = (colId: string, id: string) =>
    columns.find((c) => c.id === colId)?.labels.find((l) => l.id === id)?.label ?? id;
  const grp = (id: string) => groups.find((g) => g.id === id)?.name ?? "group";
  const dep = (id: string) => departments.find((d) => d.id === id)?.name ?? "team";

  let when = "When something happens";
  if (t?.type === "item_created") when = "When an item is created";
  else if (t?.type === "status_changes")
    when = `When ${colName(t.columnId)} changes to ${
      t.to === "any" ? "any status" : label(t.columnId, t.to)
    }`;
  else if (t?.type === "column_changes")
    when = `When ${colName(t.columnId)} ${t.when === "not_empty" ? "becomes non-empty" : "changes"}`;
  else if (t?.type === "person_assigned")
    when = `When a person is assigned in ${colName(t.columnId)}`;
  else if (t?.type === "item_moved")
    when = `When an item moves to ${t.groupId === "any" ? "any group" : `“${grp(t.groupId)}”`}`;

  let then = "do something";
  if (a?.type === "move_to_group") then = `move it to “${grp(a.groupId)}”`;
  else if (a?.type === "set_status")
    then = `set ${colName(a.columnId)} to ${label(a.columnId, a.to)}`;
  else if (a?.type === "notify")
    then = `notify ${a.target === "department" ? dep(a.targetId) : "person"}`;
  else if (a?.type === "assign_round_robin")
    then = `assign ${colName(a.columnId)} round-robin from ${dep(a.departmentId)}`;
  else if (a?.type === "generate_document")
    then = `generate “${templates.find((t) => t.id === a.templateId)?.name ?? "document"}”`;
  else if (a?.type === "request_invoice")
    then = `request an invoice to Finance (${a.account === "global" ? "Global" : "PTY"})`;
  else if (a?.type === "send_email")
    then = `send an email${a.subject ? ` “${a.subject}”` : ""}`;
  else if (a?.type === "create_item_in_board")
    then = `create an item in another board${a.connect ? " (connected)" : ""}`;

  return { when, then };
}
function safe(s: string): any {
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
}: {
  boardId: string;
  auto: Auto;
  columns: Col[];
  groups: Grp[];
  departments: Dep[];
  templates: Tpl[];
  onEdit: () => void;
}) {
  const [, start] = useTransition();
  const { when, then } = describe(auto.trigger, auto.action, columns, groups, departments, templates);

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border border-hair bg-white px-4 py-3 shadow-soft ${
        auto.enabled ? "" : "opacity-60"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{auto.name}</p>
        <p className="mt-0.5 text-xs text-body">
          <span className="font-medium text-teal-deep">{when}</span>
          <span className="text-muted"> → </span>
          <span className="font-medium text-amber">{then}</span>
        </p>
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

/* ── create modal (builder) ───────────────────────── */
function CreateModal({
  boardId,
  statusCols,
  personCols,
  numberCols,
  emailCols,
  allColumns,
  boards,
  groups,
  departments,
  templates,
  existing,
  onClose,
}: {
  boardId: string;
  statusCols: Col[];
  personCols: Col[];
  numberCols: Col[];
  emailCols: Col[];
  allColumns: Col[];
  boards: { id: string; name: string }[];
  groups: Grp[];
  departments: Dep[];
  templates: Tpl[];
  existing?: Auto | null;
  onClose: () => void;
}) {
  const et = safe(existing?.trigger ?? "{}") ?? {};
  const ea = safe(existing?.action ?? "{}") ?? {};

  const [name, setName] = useState(existing?.name ?? "");
  const [folder, setFolder] = useState(existing?.folder ?? "General");
  const [, start] = useTransition();

  // trigger state
  const [tType, setTType] = useState<
    "item_created" | "status_changes" | "column_changes" | "person_assigned" | "item_moved"
  >(et.type ?? "status_changes");
  const [tCol, setTCol] = useState(et.columnId ?? statusCols[0]?.id ?? "");
  const [tTo, setTTo] = useState(et.to ?? "any");
  const [tWhen, setTWhen] = useState<"any" | "not_empty">(et.when ?? "any");
  const [tGroup, setTGroup] = useState(et.groupId ?? "any");

  // action state
  const [aType, setAType] = useState<
    | "move_to_group"
    | "set_status"
    | "notify"
    | "assign_round_robin"
    | "generate_document"
    | "request_invoice"
    | "send_email"
    | "create_item_in_board"
  >(ea.type ?? "move_to_group");
  const [aEmailCol, setAEmailCol] = useState(
    (ea.type === "send_email" ? ea.toColumnId : "") || emailCols[0]?.id || ""
  );
  const [aSubject, setASubject] = useState(ea.type === "send_email" ? ea.subject ?? "" : "");
  const [aBody, setABody] = useState(ea.type === "send_email" ? ea.body ?? "" : "");
  const [aTargetBoard, setATargetBoard] = useState(
    (ea.type === "create_item_in_board" ? ea.boardId : "") || boards.find((b) => b.id !== boardId)?.id || ""
  );
  const [aConnect, setAConnect] = useState<boolean>(
    ea.type === "create_item_in_board" ? !!ea.connect : true
  );
  const [aGroup, setAGroup] = useState(ea.groupId ?? groups[0]?.id ?? "");
  const [aStatusCol, setAStatusCol] = useState(
    (ea.type === "set_status" ? ea.columnId : "") || statusCols[0]?.id || ""
  );
  const [aStatusTo, setAStatusTo] = useState(
    (ea.type === "set_status" ? ea.to : "") || statusCols[0]?.labels[0]?.id || ""
  );
  const [aPersonCol, setAPersonCol] = useState(
    (ea.type === "assign_round_robin" ? ea.columnId : "") || personCols[0]?.id || ""
  );
  const [aDept, setADept] = useState(ea.departmentId ?? ea.targetId ?? departments[0]?.id ?? "");
  const [aMessage, setAMessage] = useState(ea.message ?? "");
  const [aTemplate, setATemplate] = useState(ea.templateId ?? templates[0]?.id ?? "");
  const [aAccount, setAAccount] = useState(ea.account ?? "pty");
  const [aAmountCol, setAAmountCol] = useState(ea.amountColumnId ?? numberCols[0]?.id ?? "");

  const tColObj = statusCols.find((c) => c.id === tCol);
  const aStatusColObj = statusCols.find((c) => c.id === aStatusCol);

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

    let action: Record<string, unknown>;
    switch (aType) {
      case "move_to_group":
        action = { type: "move_to_group", groupId: aGroup };
        break;
      case "set_status":
        action = { type: "set_status", columnId: aStatusCol, to: aStatusTo };
        break;
      case "notify":
        action = { type: "notify", target: "department", targetId: aDept, message: aMessage };
        break;
      case "assign_round_robin":
        action = { type: "assign_round_robin", columnId: aPersonCol, departmentId: aDept };
        break;
      case "generate_document":
        action = { type: "generate_document", templateId: aTemplate };
        break;
      case "request_invoice":
        action = { type: "request_invoice", account: aAccount, amountColumnId: aAmountCol || undefined };
        break;
      case "send_email":
        action = { type: "send_email", toColumnId: aEmailCol || undefined, subject: aSubject, body: aBody };
        break;
      case "create_item_in_board":
        action = { type: "create_item_in_board", boardId: aTargetBoard, connect: aConnect };
        break;
      default:
        action = { type: "move_to_group", groupId: aGroup };
    }
    const input = { name, folder, trigger, action };
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
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <h2 className="text-lg font-bold text-ink">{existing ? "Edit automation" : "New automation"}</h2>
        <p className="mt-0.5 text-sm text-muted">Define a trigger and an action.</p>

        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Move to Contacting" className={inp} />
            </Labeled>
            <Labeled label="Folder">
              <input value={folder} onChange={(e) => setFolder(e.target.value)} className={inp} />
            </Labeled>
          </div>

          {/* WHEN */}
          <div className="rounded-xl border border-hair bg-canvas/50 p-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-teal-deep">
              When
            </p>
            <select value={tType} onChange={(e) => setTType(e.target.value as any)} className={inp}>
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

          {/* THEN */}
          <div className="rounded-xl border border-hair bg-canvas/50 p-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-amber">
              Then
            </p>
            <select value={aType} onChange={(e) => setAType(e.target.value as any)} className={inp}>
              <option value="move_to_group">Move item to group</option>
              <option value="set_status">Set a status</option>
              <option value="notify">Notify a department</option>
              <option value="assign_round_robin">Assign person (round robin)</option>
              <option value="generate_document">Generate a document</option>
              <option value="request_invoice">Request an invoice (to Finance)</option>
              <option value="send_email">Send an email</option>
              <option value="create_item_in_board">Create item in another board</option>
            </select>

            {aType === "move_to_group" && (
              <select value={aGroup} onChange={(e) => setAGroup(e.target.value)} className={`${inp} mt-2`}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
            {aType === "set_status" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select
                  value={aStatusCol}
                  onChange={(e) => {
                    setAStatusCol(e.target.value);
                    const c = statusCols.find((x) => x.id === e.target.value);
                    setAStatusTo(c?.labels[0]?.id ?? "");
                  }}
                  className={inp}
                >
                  {statusCols.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select value={aStatusTo} onChange={(e) => setAStatusTo(e.target.value)} className={inp}>
                  {aStatusColObj?.labels.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </div>
            )}
            {aType === "notify" && (
              <div className="mt-2 grid gap-2">
                <select value={aDept} onChange={(e) => setADept(e.target.value)} className={inp}>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <input value={aMessage} onChange={(e) => setAMessage(e.target.value)} placeholder="Message…" className={inp} />
              </div>
            )}
            {aType === "assign_round_robin" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select value={aPersonCol} onChange={(e) => setAPersonCol(e.target.value)} className={inp}>
                  {personCols.length === 0 && <option value="">No person column</option>}
                  {personCols.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select value={aDept} onChange={(e) => setADept(e.target.value)} className={inp}>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
            {aType === "generate_document" && (
              <select value={aTemplate} onChange={(e) => setATemplate(e.target.value)} className={`${inp} mt-2`}>
                {templates.length === 0 && <option value="">No templates — create one via 📄 Docs</option>}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            {aType === "request_invoice" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select value={aAccount} onChange={(e) => setAAccount(e.target.value)} className={inp}>
                  <option value="pty">Osphine PTY</option>
                  <option value="global">Osphine Global</option>
                </select>
                <select value={aAmountCol} onChange={(e) => setAAmountCol(e.target.value)} className={inp}>
                  <option value="">Amount: none</option>
                  {numberCols.map((c) => (
                    <option key={c.id} value={c.id}>Amount: {c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {aType === "send_email" && (
              <div className="mt-2 grid gap-2">
                <select value={aEmailCol} onChange={(e) => setAEmailCol(e.target.value)} className={inp}>
                  {emailCols.length === 0 && <option value="">First email column on the item</option>}
                  {emailCols.map((c) => (
                    <option key={c.id} value={c.id}>Send to: {c.name}</option>
                  ))}
                </select>
                <input value={aSubject} onChange={(e) => setASubject(e.target.value)} placeholder="Subject — e.g. Welcome {{Item}}!" className={inp} />
                <textarea
                  value={aBody}
                  onChange={(e) => setABody(e.target.value)}
                  rows={4}
                  placeholder={"Body — use {{Item}}, {{Program}}, {{Email}}…\n\nHi {{Item}},\nThank you for registering."}
                  className={`${inp} resize-y`}
                />
                {/* Live preview */}
                <div className="rounded-lg border border-hair bg-white p-2.5">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Preview (sample data)</p>
                  <p className="text-xs font-semibold text-ink">{previewText(aSubject) || "(no subject)"}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-body">{previewText(aBody) || "(empty body)"}</p>
                </div>
              </div>
            )}
            {aType === "create_item_in_board" && (
              <div className="mt-2 grid gap-2">
                <select value={aTargetBoard} onChange={(e) => setATargetBoard(e.target.value)} className={inp}>
                  {boards.filter((b) => b.id !== boardId).length === 0 && <option value="">No other boards</option>}
                  {boards.filter((b) => b.id !== boardId).map((b) => (
                    <option key={b.id} value={b.id}>Create in: {b.name}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-body">
                  <input type="checkbox" checked={aConnect} onChange={(e) => setAConnect(e.target.checked)} />
                  Connect the two items (enables mirror columns)
                </label>
              </div>
            )}
          </div>
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
