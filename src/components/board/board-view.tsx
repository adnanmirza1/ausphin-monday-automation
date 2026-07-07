"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { BoardData, PersonLite } from "@/lib/board-types";
import { renameBoard, archiveBoard } from "@/app/actions/board";
import { TableView, type RowHeight } from "./table-view";
import { KanbanView } from "./kanban-view";
import { CalendarView } from "./calendar-view";
import { AddColumnButton } from "./add-column";
import { FormButton } from "./form-button";
import { DocsButton, type TemplateLite } from "./docs-button";
import { BoardUIProvider } from "./board-ui";
import { createView, deleteView, pinView, type ViewConfig } from "@/app/actions/views";

type ViewMode = "table" | "kanban" | "calendar";

type SavedView = {
  id: string;
  name: string;
  isPinned: boolean;
  config: ViewConfig;
};

export function BoardView({
  board,
  people,
  departments,
  templates,
  employers,
  views,
  connectionOptions,
  allBoards,
  boardColumnsMap,
  readOnly,
}: {
  board: BoardData;
  people: PersonLite[];
  departments: { id: string; name: string }[];
  templates: TemplateLite[];
  employers: { id: string; name: string }[];
  views: SavedView[];
  connectionOptions: Record<string, { id: string; name: string }[]>;
  allBoards: { id: string; name: string }[];
  boardColumnsMap: Record<string, { id: string; name: string; type: string }[]>;
  readOnly: boolean;
}) {
  const [mode, setMode] = useState<ViewMode>("table");
  const [q, setQ] = useState("");

  // Active saved view — default to the pinned one, else "Main".
  const pinned = views.find((v) => v.isPinned);
  const [activeId, setActiveId] = useState<string>(pinned?.id ?? "main");
  const active = views.find((v) => v.id === activeId);

  const [hidden, setHidden] = useState<Set<string>>(
    new Set(pinned?.config.hiddenColumns ?? [])
  );
  const [filters, setFilters] = useState<{ columnId: string; value: string }[]>(
    pinned?.config.filters ?? []
  );

  const [colsOpen, setColsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [rowHeight, setRowHeight] = useState<RowHeight>("default");
  const [colorBy, setColorBy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, start] = useTransition();

  function selectView(id: string) {
    setActiveId(id);
    const v = views.find((x) => x.id === id);
    setHidden(new Set(v?.config.hiddenColumns ?? []));
    setFilters(v?.config.filters ?? []);
  }

  const statusCols = board.columns.filter((c) => c.type === "status");

  // Apply hidden columns + filters + search.
  const view = useMemo(() => {
    const cols = board.columns.filter((c) => !hidden.has(c.id));
    const needle = q.trim().toLowerCase();
    const groups = board.groups.map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (needle && !it.name.toLowerCase().includes(needle)) return false;
        for (const f of filters) {
          if ((it.cells[f.columnId]?.value ?? "") !== f.value) return false;
        }
        return true;
      }),
    }));
    return { ...board, columns: cols, groups };
  }, [board, hidden, filters, q]);

  const total = board.groups.reduce((n, g) => n + g.items.length, 0);
  const shown = view.groups.reduce((n, g) => n + g.items.length, 0);
  const hasStatus = view.columns.some((c) => c.type === "status");
  const hasDate = view.columns.some((c) => c.type === "date");
  const dirty =
    JSON.stringify([...hidden].sort()) !==
      JSON.stringify((active?.config.hiddenColumns ?? []).slice().sort()) ||
    JSON.stringify(filters) !== JSON.stringify(active?.config.filters ?? []);

  function labelFor(columnId: string, valueId: string) {
    const col = board.columns.find((c) => c.id === columnId);
    return col?.labels.find((l) => l.id === valueId)?.label ?? valueId;
  }

  return (
    <BoardUIProvider
      boardId={board.id}
      departments={departments}
      templates={templates}
      employers={employers}
    >
      <div className="flex h-full flex-col">
        {/* Board header */}
        <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
                {board.environmentName}
              </p>
              <BoardTitle boardId={board.id} name={board.name} readOnly={readOnly} />
            </div>
            <div className="flex items-center gap-2">
              {!readOnly && <DocsButton boardId={board.id} templates={templates} columns={board.columns} />}
              {!readOnly && <FormButton boardId={board.id} form={board.form} columns={board.columns} />}
              {!readOnly && (
                <Link href={`/boards/${board.id}/automations`} className={pillBtn}>⚡ Automate</Link>
              )}
              {!readOnly && (
                <Link href={`/boards/${board.id}/reminders`} className={pillBtn}>⏰ Remind</Link>
              )}
              {!readOnly && (
                <AddColumnButton
                  boardId={board.id}
                  allBoards={allBoards.filter((b) => b.id !== board.id)}
                  boardColumnsMap={boardColumnsMap}
                  connectionColumns={board.columns
                    .filter((c) => c.type === "connection")
                    .map((c) => ({ id: c.id, name: c.name, targetBoardId: c.targetBoardId }))}
                />
              )}
            </div>
          </div>

          {/* View tabs */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <ViewTab active={activeId === "main"} onClick={() => selectView("main")}>
              Main Table
            </ViewTab>
            {views.map((v) => (
              <ViewTab key={v.id} active={activeId === v.id} onClick={() => selectView(v.id)}>
                {v.isPinned && <span className="mr-1">📌</span>}
                {v.name}
              </ViewTab>
            ))}
            {!readOnly && (
              <button
                onClick={() => setSaving(true)}
                className="rounded-md px-2.5 py-1.5 text-sm text-muted hover:text-teal"
                title="Save current filters & hidden columns as a view"
              >
                + Save view
              </button>
            )}
            {!readOnly && active && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => start(() => void pinView(board.id, active.id, !active.isPinned))}
                  className="rounded-md px-2 py-1 text-xs text-muted hover:text-teal"
                >
                  {active.isPinned ? "Unpin" : "📌 Pin"}
                </button>
                <button
                  onClick={() => {
                    start(() => void deleteView(board.id, active.id));
                    selectView("main");
                  }}
                  className="rounded-md px-2 py-1 text-xs text-muted hover:text-danger"
                >
                  Delete view
                </button>
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-hair bg-canvas p-0.5">
              <ModeTab active={mode === "table"} onClick={() => setMode("table")} icon="▤">Table</ModeTab>
              <ModeTab active={mode === "kanban"} onClick={() => setMode("kanban")} icon="▥" disabled={!hasStatus}>
                Kanban
              </ModeTab>
              <ModeTab active={mode === "calendar"} onClick={() => setMode("calendar")} icon="▦" disabled={!hasDate}>
                Calendar
              </ModeTab>
            </div>

            {/* Columns control */}
            <Popover open={colsOpen} setOpen={setColsOpen} label={`Columns${hidden.size ? ` · ${hidden.size} hidden` : ""}`}>
              <p className="mb-1.5 text-xs font-semibold text-body">Show columns</p>
              <div className="flex max-h-60 flex-col gap-1 overflow-y-auto scroll-thin">
                {board.columns.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-canvas">
                    <input
                      type="checkbox"
                      checked={!hidden.has(c.id)}
                      onChange={() =>
                        setHidden((h) => {
                          const n = new Set(h);
                          n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                          return n;
                        })
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </Popover>

            {/* Filter control */}
            {statusCols.length > 0 && (
              <Popover open={filterOpen} setOpen={setFilterOpen} label={`Filter${filters.length ? ` · ${filters.length}` : ""}`}>
                <p className="mb-1.5 text-xs font-semibold text-body">Filter by status</p>
                {statusCols.map((c) => (
                  <div key={c.id} className="mb-2">
                    <p className="text-xs font-medium text-muted">{c.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.labels.map((l) => {
                        const on = filters.some((f) => f.columnId === c.id && f.value === l.id);
                        return (
                          <button
                            key={l.id}
                            onClick={() =>
                              setFilters((fs) =>
                                on
                                  ? fs.filter((f) => !(f.columnId === c.id && f.value === l.id))
                                  : [...fs.filter((f) => f.columnId !== c.id), { columnId: c.id, value: l.id }]
                              )
                            }
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                            style={{ background: l.color, opacity: on ? 1 : 0.45 }}
                          >
                            {l.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {filters.length > 0 && (
                  <button onClick={() => setFilters([])} className="mt-1 text-xs text-muted hover:text-danger">
                    Clear filters
                  </button>
                )}
              </Popover>
            )}

            {/* active filter chips */}
            {filters.map((f) => (
              <span key={`${f.columnId}-${f.value}`} className="rounded-full bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal-deep">
                {labelFor(f.columnId, f.value)}
              </span>
            ))}

            {/* ⋯ more view options: item height + conditional coloring */}
            <Popover open={moreOpen} setOpen={setMoreOpen} label="⋯">
              <p className="mb-1.5 text-xs font-semibold text-body">Item height</p>
              <div className="mb-3 inline-flex rounded-lg border border-hair p-0.5">
                {(["compact", "default", "tall"] as RowHeight[]).map((h) => (
                  <button
                    key={h}
                    onClick={() => setRowHeight(h)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${
                      rowHeight === h ? "bg-teal/10 text-teal-deep" : "text-muted hover:text-body"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <p className="mb-1.5 text-xs font-semibold text-body">Conditional coloring</p>
              {statusCols.length === 0 ? (
                <p className="text-xs text-muted">Add a status column to colour rows.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => setColorBy(null)}
                    className={`rounded px-2 py-1 text-left text-sm transition ${
                      colorBy === null ? "bg-teal/10 text-teal-deep" : "text-body hover:bg-canvas"
                    }`}
                  >
                    Off
                  </button>
                  {statusCols.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setColorBy(c.id)}
                      className={`rounded px-2 py-1 text-left text-sm transition ${
                        colorBy === c.id ? "bg-teal/10 text-teal-deep" : "text-body hover:bg-canvas"
                      }`}
                    >
                      Colour by “{c.name}”
                    </button>
                  ))}
                </div>
              )}
            </Popover>

            {/* search */}
            <div className="relative flex-1 sm:max-w-xs">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">⌕</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search items…"
                className="w-full rounded-lg border border-hair bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-teal"
              />
            </div>

            <span className="ml-auto text-xs text-muted">
              {q || filters.length ? `${shown} of ${total}` : `${total} items`}
              {dirty && !readOnly && <span className="ml-1 text-amber">· unsaved</span>}
            </span>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-auto scroll-thin">
          {mode === "table" && (
            <TableView
              board={view}
              people={people}
              readOnly={readOnly}
              connectionOptions={connectionOptions}
              rowHeight={rowHeight}
              colorBy={colorBy}
            />
          )}
          {mode === "kanban" && <KanbanView board={view} people={people} readOnly={readOnly} />}
          {mode === "calendar" && <CalendarView board={view} readOnly={readOnly} />}
        </div>
      </div>

      {saving && (
        <SaveModal
          onClose={() => setSaving(false)}
          onSave={(name) => {
            start(() =>
              void createView(board.id, name, { hiddenColumns: [...hidden], filters })
            );
            setSaving(false);
          }}
        />
      )}
    </BoardUIProvider>
  );
}

const pillBtn =
  "rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas";

function BoardTitle({ boardId, name, readOnly }: { boardId: string; name: string; readOnly: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const [menu, setMenu] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (val.trim() && val !== name) start(() => void renameBoard(boardId, val));
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="w-64 rounded-md border border-hair px-2 py-0.5 text-lg font-bold text-ink outline-none focus:border-teal"
      />
    );
  }

  return (
    <div className="relative flex items-center gap-1">
      <h1 className="truncate text-lg font-bold text-ink">{name}</h1>
      {!readOnly && (
        <button onClick={() => setMenu((m) => !m)} className="rounded px-1 text-muted hover:text-ink" title="Board options">
          ⋯
        </button>
      )}
      {menu && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
          <div className="absolute left-0 top-8 z-30 w-36 rounded-lg border border-hair bg-white p-1 shadow-pop">
            <button
              onClick={() => { setMenu(false); setEditing(true); }}
              className="block w-full rounded px-2 py-1.5 text-left text-sm text-body hover:bg-canvas"
            >
              Rename board
            </button>
            <button
              onClick={() => {
                setMenu(false);
                if (confirm(`Archive board "${name}"? You can restore it from Archive/Trash.`))
                  start(async () => { await archiveBoard(boardId); router.push("/"); });
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-sm text-danger hover:bg-canvas"
            >
              Archive board
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-teal/10 text-teal-deep" : "text-muted hover:bg-canvas hover:text-body"
      }`}
    >
      {children}
    </button>
  );
}

function ModeTab({
  active, onClick, icon, children, disabled,
}: { active: boolean; onClick: () => void; icon: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-white text-ink shadow-soft" : "text-muted hover:text-body disabled:opacity-40"
      }`}
    >
      <span className="text-xs">{icon}</span>
      {children}
    </button>
  );
}

function Popover({
  open, setOpen, label, children,
}: { open: boolean; setOpen: (v: boolean) => void; label: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-hair bg-white px-3 py-1.5 text-sm text-body hover:bg-canvas"
      >
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1 w-64 rounded-xl border border-hair bg-white p-3 shadow-pop">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function SaveModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <h2 className="text-lg font-bold text-ink">Save view</h2>
        <p className="mt-0.5 text-sm text-muted">Saves current hidden columns + filters.</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name)}
          placeholder="e.g. 400 Visa · clean"
          className="mt-4 w-full rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">Cancel</button>
          <button
            onClick={() => name.trim() && onSave(name)}
            disabled={!name.trim()}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            Save view
          </button>
        </div>
      </div>
    </div>
  );
}
