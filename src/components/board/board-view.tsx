"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { BoardData, PersonLite, PermData } from "@/lib/board-types";
import { renameBoard, archiveBoard, sortItemsByColumn } from "@/app/actions/board";
import { TableView, type RowHeight } from "./table-view";
import { KanbanView } from "./kanban-view";
import { CalendarView } from "./calendar-view";
import { ChartView } from "./chart-view";
import { AddColumnButton } from "./add-column";
import { FormButton } from "./form-button";
import { DocsButton, type TemplateLite } from "./docs-button";
import { ImportExportButton } from "./data-io";
import { BoardUIProvider } from "./board-ui";
import { createView, deleteView, pinView, type ViewConfig } from "@/app/actions/views";

type ViewMode = "table" | "kanban" | "calendar" | "chart";

type SavedView = {
  id: string;
  name: string;
  isPinned: boolean;
  config: ViewConfig;
};

type FacetOption = {
  value: string;
  label: string;
  color?: string; // status label / group colour
  personColor?: string; // person avatar colour
  count: number;
};
type Facet = { key: string; name: string; columnId?: string; options: FacetOption[] };

// ── Advanced filter conditions (operators + date ranges) ──────
type Cond = { id: string; columnId: string; op: string; v1?: string; v2?: string };

const TEXT_OPS = [
  ["contains", "contains"], ["is", "is"], ["is_not", "is not"],
  ["empty", "is empty"], ["not_empty", "is not empty"],
];
const STATUS_OPS = [["is", "is"], ["is_not", "is not"], ["empty", "is empty"], ["not_empty", "is not empty"]];
const DATE_OPS = [
  ["today", "is today"], ["this_week", "this week"], ["last_week", "last week"], ["next_week", "next week"],
  ["this_month", "this month"], ["last_month", "last month"], ["next_month", "next month"], ["this_year", "this year"],
  ["between", "is between"], ["empty", "is empty"], ["not_empty", "is not empty"],
];
function opsForType(type: string): [string, string][] {
  if (type === "date") return DATE_OPS as [string, string][];
  if (type === "status") return STATUS_OPS as [string, string][];
  return TEXT_OPS as [string, string][];
}

function dateInPreset(v: string, preset: string): boolean {
  const d = new Date(v + "T00:00:00");
  if (isNaN(+d)) return false;
  const now = new Date();
  const sod = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const day = 86400000;
  const t = sod(now);
  const dd = sod(d);
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  const weekStart = t - dow * day;
  switch (preset) {
    case "today": return dd === t;
    case "this_week": return dd >= weekStart && dd < weekStart + 7 * day;
    case "last_week": return dd >= weekStart - 7 * day && dd < weekStart;
    case "next_week": return dd >= weekStart + 7 * day && dd < weekStart + 14 * day;
    case "this_month": return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    case "last_month": {
      const m = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
    }
    case "next_month": {
      const m = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
    }
    case "this_year": return d.getFullYear() === now.getFullYear();
    default: return true;
  }
}
function matchCond(cellVal: string, cond: Cond): boolean {
  const v = (cellVal ?? "").trim();
  switch (cond.op) {
    case "empty": return v === "";
    case "not_empty": return v !== "";
    case "is": return v === (cond.v1 ?? "");
    case "is_not": return v !== (cond.v1 ?? "");
    case "contains": return v.toLowerCase().includes((cond.v1 ?? "").toLowerCase());
    case "between": return !cond.v1 || !cond.v2 ? true : v >= cond.v1 && v <= cond.v2;
    case "today": case "this_week": case "last_week": case "next_week":
    case "this_month": case "last_month": case "next_month": case "this_year":
      return dateInPreset(v, cond.op);
    default: return true;
  }
}

export function BoardView({
  board,
  people,
  departments,
  permData,
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
  permData: PermData;
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
  const [adv, setAdv] = useState<Cond[]>([]);
  const [advOpen, setAdvOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [rowHeight, setRowHeight] = useState<RowHeight>("default");
  const [colorBy, setColorBy] = useState<string | null>(null);
  const [pinFirst, setPinFirst] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, start] = useTransition();

  function selectView(id: string) {
    setActiveId(id);
    const v = views.find((x) => x.id === id);
    setHidden(new Set(v?.config.hiddenColumns ?? []));
    setFilters(v?.config.filters ?? []);
  }

  const statusCols = board.columns.filter((c) => c.type === "status");
  const sortableCols = board.columns.filter((c) =>
    ["status", "text", "longtext", "number", "date", "email", "phone"].includes(c.type)
  );
  const advCols = board.columns.filter((c) =>
    ["status", "text", "longtext", "number", "date", "email", "phone", "url"].includes(c.type)
  );
  const addCond = () =>
    setAdv((a) => {
      const col = advCols[0];
      if (!col) return a;
      return [
        ...a,
        { id: `c${a.length}${col.id.slice(-3)}`, columnId: col.id, op: opsForType(col.type)[0][0], v1: "", v2: "" },
      ];
    });
  const updateCond = (id: string, patch: Partial<Cond>) =>
    setAdv((a) => a.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCond = (id: string) => setAdv((a) => a.filter((c) => c.id !== id));
  const NEEDS_VAL = new Set(["is", "is_not", "contains", "between"]);

  // Apply hidden columns + filters + search.
  // Filters: OR within one column, AND across columns; "__group__" filters
  // by group. Blank is represented by the empty-string value.
  const view = useMemo(() => {
    const cols = board.columns.filter((c) => !hidden.has(c.id));
    const needle = q.trim().toLowerCase();
    const byCol = new Map<string, Set<string>>();
    for (const f of filters) {
      if (!byCol.has(f.columnId)) byCol.set(f.columnId, new Set());
      byCol.get(f.columnId)!.add(f.value);
    }
    const groupSel = byCol.get("__group__");
    const groups = board.groups
      .filter((g) => !groupSel || groupSel.has(g.id))
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => {
          if (needle && !it.name.toLowerCase().includes(needle)) return false;
          for (const [colId, vals] of byCol) {
            if (colId === "__group__") continue;
            if (!vals.has(it.cells[colId]?.value ?? "")) return false;
          }
          // Advanced conditions (operators + date ranges), all must pass.
          for (const c of adv) {
            if (!c.columnId) continue;
            if (!matchCond(it.cells[c.columnId]?.value ?? "", c)) return false;
          }
          return true;
        }),
      }));
    return { ...board, columns: cols, groups };
  }, [board, hidden, filters, q, adv]);

  // Facets for the quick-filter panel: one per group + per filterable column,
  // each with its distinct values and item counts.
  const facets = useMemo<Facet[]>(() => {
    const allItems = board.groups.flatMap((g) => g.items);
    const out: Facet[] = [
      {
        key: "__group__",
        name: "Group",
        options: board.groups.map((g) => ({
          value: g.id,
          label: g.name,
          color: g.color,
          count: g.items.length,
        })),
      },
    ];
    const FILTERABLE = ["status", "person", "text", "longtext", "number", "date", "email", "phone"];
    for (const c of board.columns) {
      if (!FILTERABLE.includes(c.type)) continue;
      const counts = new Map<string, number>();
      for (const it of allItems) {
        const v = it.cells[c.id]?.value ?? "";
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      let options: FacetOption[] = [];
      if (c.type === "status") {
        options = c.labels.map((l) => ({
          value: l.id,
          label: l.label,
          color: l.color,
          count: counts.get(l.id) ?? 0,
        }));
      } else if (c.type === "person") {
        options = [...counts.keys()]
          .filter((v) => v !== "")
          .map((id) => {
            const p = people.find((pp) => pp.id === id);
            return { value: id, label: p?.name ?? "Unknown", personColor: p?.avatarColor, count: counts.get(id) ?? 0 };
          });
      } else {
        options = [...counts.keys()]
          .filter((v) => v !== "")
          .sort()
          .map((v) => ({ value: v, label: v, count: counts.get(v) ?? 0 }));
      }
      const blank = counts.get("") ?? 0;
      if (blank > 0) options.push({ value: "", label: "Blank", count: blank });
      if (options.length) out.push({ key: c.id, name: c.name, options, columnId: c.id });
    }
    return out;
  }, [board, people]);

  const total = board.groups.reduce((n, g) => n + g.items.length, 0);
  const shown = view.groups.reduce((n, g) => n + g.items.length, 0);
  const hasStatus = view.columns.some((c) => c.type === "status");
  const hasDate = view.columns.some((c) => c.type === "date");
  const dirty =
    JSON.stringify([...hidden].sort()) !==
      JSON.stringify((active?.config.hiddenColumns ?? []).slice().sort()) ||
    JSON.stringify(filters) !== JSON.stringify(active?.config.filters ?? []);

  function chipLabel(f: { columnId: string; value: string }) {
    if (f.columnId === "__group__")
      return board.groups.find((g) => g.id === f.value)?.name ?? "Group";
    const col = board.columns.find((c) => c.id === f.columnId);
    if (!col) return f.value;
    if (f.value === "") return `${col.name}: Blank`;
    if (col.type === "status")
      return col.labels.find((l) => l.id === f.value)?.label ?? f.value;
    if (col.type === "person")
      return people.find((p) => p.id === f.value)?.name ?? f.value;
    return f.value;
  }
  function toggleFilter(columnId: string, value: string) {
    setFilters((fs) => {
      const on = fs.some((f) => f.columnId === columnId && f.value === value);
      return on
        ? fs.filter((f) => !(f.columnId === columnId && f.value === value))
        : [...fs, { columnId, value }];
    });
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
              {!readOnly && <FormButton boardId={board.id} forms={board.forms} columns={board.columns} groups={board.groups.map((g) => ({ id: g.id, name: g.name }))} />}
              <ImportExportButton board={board} />
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
              <ModeTab active={mode === "chart"} onClick={() => setMode("chart")} icon="📊">
                Dashboard
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
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </Popover>

            {/* Filter control — quick filters across every column */}
            <FilterPanel
              open={filterOpen}
              setOpen={setFilterOpen}
              facets={facets}
              filters={filters}
              toggle={toggleFilter}
              clearAll={() => setFilters([])}
              shown={shown}
              total={total}
            />

            {/* Advanced filter — operators + date ranges */}
            {advCols.length > 0 && (
              <Popover open={advOpen} setOpen={setAdvOpen} label={`Advanced${adv.length ? ` · ${adv.length}` : ""}`}>
                <p className="mb-1.5 text-xs font-semibold text-body">Advanced conditions</p>
                <div className="flex max-h-72 w-72 flex-col gap-2 overflow-y-auto scroll-thin">
                  {adv.length === 0 && <p className="text-xs text-muted">No conditions yet.</p>}
                  {adv.map((c) => {
                    const col = board.columns.find((x) => x.id === c.columnId);
                    const type = col?.type ?? "text";
                    return (
                      <div key={c.id} className="space-y-1.5 rounded-lg border border-hair p-2">
                        <div className="flex gap-1.5">
                          <select
                            value={c.columnId}
                            onChange={(e) => {
                              const nt = board.columns.find((x) => x.id === e.target.value)?.type ?? "text";
                              updateCond(c.id, { columnId: e.target.value, op: opsForType(nt)[0][0], v1: "", v2: "" });
                            }}
                            className={miniInp}
                          >
                            {advCols.map((cc) => (
                              <option key={cc.id} value={cc.id}>{cc.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => removeCond(c.id)}
                            className="grid h-7 w-7 flex-none place-items-center rounded text-muted hover:bg-danger/10 hover:text-danger"
                          >
                            ✕
                          </button>
                        </div>
                        <select value={c.op} onChange={(e) => updateCond(c.id, { op: e.target.value })} className={miniInp}>
                          {opsForType(type).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                        {NEEDS_VAL.has(c.op) &&
                          (type === "status" ? (
                            <select value={c.v1 ?? ""} onChange={(e) => updateCond(c.id, { v1: e.target.value })} className={miniInp}>
                              <option value="">(pick label)</option>
                              {col?.labels.map((l) => (
                                <option key={l.id} value={l.id}>{l.label}</option>
                              ))}
                            </select>
                          ) : c.op === "between" ? (
                            <div className="flex gap-1.5">
                              <input type="date" value={c.v1 ?? ""} onChange={(e) => updateCond(c.id, { v1: e.target.value })} className={miniInp} />
                              <input type="date" value={c.v2 ?? ""} onChange={(e) => updateCond(c.id, { v2: e.target.value })} className={miniInp} />
                            </div>
                          ) : (
                            <input
                              type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                              value={c.v1 ?? ""}
                              onChange={(e) => updateCond(c.id, { v1: e.target.value })}
                              placeholder="value"
                              className={miniInp}
                            />
                          ))}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <button onClick={addCond} className="text-sm font-medium text-teal hover:underline">+ Add condition</button>
                  {adv.length > 0 && (
                    <button onClick={() => setAdv([])} className="text-xs text-muted hover:text-danger">Clear all</button>
                  )}
                </div>
              </Popover>
            )}

            {/* Sort control */}
            {sortableCols.length > 0 && (
              <Popover open={sortOpen} setOpen={setSortOpen} label="Sort">
                <p className="mb-1.5 text-xs font-semibold text-body">Sort items by</p>
                <div className="flex max-h-64 flex-col gap-1 overflow-y-auto scroll-thin">
                  {sortableCols.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-canvas">
                      <span className="truncate text-sm text-body">{c.name}</span>
                      <span className="flex flex-none gap-1">
                        <button
                          onClick={() => { setSortOpen(false); start(() => void sortItemsByColumn(board.id, c.id, "asc")); }}
                          className="rounded border border-hair px-1.5 py-0.5 text-xs text-muted hover:text-teal"
                          title="Ascending"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => { setSortOpen(false); start(() => void sortItemsByColumn(board.id, c.id, "desc")); }}
                          className="rounded border border-hair px-1.5 py-0.5 text-xs text-muted hover:text-teal"
                          title="Descending"
                        >
                          ↓
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </Popover>
            )}

            {/* active filter chips (click to remove) */}
            {filters.map((f) => (
              <button
                key={`${f.columnId}-${f.value}`}
                onClick={() => toggleFilter(f.columnId, f.value)}
                className="flex items-center gap-1 rounded-full bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal-deep hover:bg-teal/20"
                title="Remove filter"
              >
                {chipLabel(f)} <span className="text-teal-deep/60">✕</span>
              </button>
            ))}

            {/* ⋯ more view options: item height + conditional coloring */}
            <Popover open={moreOpen} setOpen={setMoreOpen} label="⋯">
              <label className="mb-3 flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-canvas">
                <input
                  type="checkbox"
                  checked={pinFirst}
                  onChange={() => setPinFirst((p) => !p)}
                />
                Freeze first column
              </label>
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
              permData={permData}
              readOnly={readOnly}
              connectionOptions={connectionOptions}
              rowHeight={rowHeight}
              colorBy={colorBy}
              pinFirst={pinFirst}
            />
          )}
          {mode === "kanban" && <KanbanView board={view} people={people} readOnly={readOnly} />}
          {mode === "calendar" && <CalendarView board={view} readOnly={readOnly} />}
          {mode === "chart" && <ChartView board={view} people={people} />}
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

const miniInp =
  "min-w-0 flex-1 rounded-md border border-hair bg-white px-2 py-1.5 text-xs outline-none focus:border-teal";

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

function FilterPanel({
  open,
  setOpen,
  facets,
  filters,
  toggle,
  clearAll,
  shown,
  total,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  facets: Facet[];
  filters: { columnId: string; value: string }[];
  toggle: (columnId: string, value: string) => void;
  clearAll: () => void;
  shown: number;
  total: number;
}) {
  const on = (columnId: string, value: string) =>
    filters.some((f) => f.columnId === columnId && f.value === value);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`rounded-lg border px-3 py-1.5 text-sm hover:bg-canvas ${
          filters.length ? "border-teal/50 bg-teal/5 text-teal-deep" : "border-hair bg-white text-body"
        }`}
      >
        Filter{filters.length ? ` · ${filters.length}` : ""}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1 w-[min(92vw,760px)] rounded-xl border border-hair bg-white p-4 shadow-pop">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-ink">
                Quick filters{" "}
                <span className="ml-1 text-xs font-normal text-muted">
                  Showing {shown} of {total}
                </span>
              </p>
              {filters.length > 0 && (
                <button onClick={clearAll} className="text-xs text-muted hover:text-danger">
                  Clear all
                </button>
              )}
            </div>
            <div className="flex gap-4 overflow-x-auto scroll-thin pb-1">
              {facets.map((facet) => (
                <div key={facet.key} className="w-40 flex-none">
                  <p className="mb-1.5 truncate text-xs font-semibold text-muted">{facet.name}</p>
                  <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto scroll-thin">
                    {facet.options.map((opt) => {
                      const active = on(facet.columnId ?? facet.key, opt.value);
                      return (
                        <button
                          key={opt.value || "__blank__"}
                          onClick={() => toggle(facet.columnId ?? facet.key, opt.value)}
                          className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition ${
                            active ? "bg-teal/10 ring-1 ring-teal/40" : "hover:bg-canvas"
                          }`}
                        >
                          {opt.color && (
                            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: opt.color }} />
                          )}
                          {opt.personColor && (
                            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: opt.personColor }} />
                          )}
                          <span className="flex-1 truncate text-body">{opt.label}</span>
                          <span className="flex-none text-[10px] text-muted">{opt.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
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
