"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { BoardData } from "@/lib/board-types";
import { PALETTE } from "@/lib/constants";
import { updateViewConfig } from "@/app/actions/views";
import { getDashboardRows, type DashData, type DashPerson } from "@/app/actions/dashboard";
import { toPng, toJpeg } from "html-to-image";

// ── Widget configuration (persisted in the dashboard view's config JSON) ──────
export type ChartType = "bar" | "column" | "line" | "area" | "pie" | "donut" | "bubble";
// Aggregations mirror monday.com's Numbers/Chart functions.
export type YAgg = "count" | "sum" | "average" | "median" | "min" | "max";

function aggregate(values: number[], count: number, agg: YAgg): number {
  if (agg === "count") return count;
  if (values.length === 0) return 0;
  if (agg === "sum") return values.reduce((s, n) => s + n, 0);
  if (agg === "average") return values.reduce((s, n) => s + n, 0) / values.length;
  if (agg === "min") return Math.min(...values);
  if (agg === "max") return Math.max(...values);
  // median
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Filter operators (monday-style). Relative ops (in_next/in_last) evaluate
// against the current date, so they update automatically over time.
export type FilterOp =
  | "is"
  | "is_not"
  | "after"
  | "on_or_after"
  | "before"
  | "on_or_before"
  | "between"
  | "in_next"
  | "in_last"
  | "empty"
  | "not_empty"
  | "is_only"
  | "anything";

// A single filter clause. `value`/`value2` meaning depends on `op`.
export type ChartFilter = { column: string; op?: FilterOp; value?: string; value2?: string };

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoAddDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export type WidgetConfig = {
  id: string;
  type: "numbers" | "battery" | "progress" | "activity" | "chart";
  title?: string;
  // chart-only
  chartType?: ChartType;
  boardIds?: string[]; // data sources; default = [current board]
  xColumn?: string; // x-axis column NAME
  groupBy?: string; // optional breakdown column → stacked series (like monday)
  yAgg?: YAgg;
  yColumn?: string; // number column NAME for sum/average
  filters?: ChartFilter[]; // applied to all rows (global)
  boardFilters?: Record<string, ChartFilter[]>; // per-connected-board filters (§5F)
};

const WIDGET_CATALOG: { type: WidgetConfig["type"]; name: string; desc: string; icon: string; preset?: Partial<WidgetConfig> }[] = [
  { type: "chart", name: "Chart", desc: "Configurable chart from one or more boards", icon: "📊" },
  { type: "numbers", name: "Numbers", desc: "Headline counts", icon: "#" },
  { type: "battery", name: "Battery", desc: "Status share bar", icon: "▰" },
  { type: "progress", name: "Progress", desc: "Completion %", icon: "◔" },
  { type: "activity", name: "Activity Analytics", desc: "Items per group", icon: "⚡" },
  {
    type: "chart",
    name: "Data Over Time",
    desc: "Items created per month",
    icon: "📈",
    preset: { chartType: "area", xColumn: "Created month", yAgg: "count" },
  },
];

let widgetSeq = 0;
function newId(type: string) {
  widgetSeq += 1;
  return `${type}-${widgetSeq}-${widgetSeq * 7 + 3}`;
}

export function BoardDashboard({
  boardId,
  viewId,
  initialWidgets,
  initialBoards,
  initialFilters,
  board,
  allBoards,
  readOnly,
}: {
  boardId: string;
  viewId: string;
  initialWidgets: WidgetConfig[];
  initialBoards?: string[];
  initialFilters?: ChartFilter[];
  board: BoardData;
  allBoards: { id: string; name: string }[];
  readOnly: boolean;
}) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(initialWidgets ?? []);
  // Dashboard-level connected boards + filters (monday-style) — inherited by widgets.
  const [connectedBoards, setConnectedBoards] = useState<string[]>(
    initialBoards?.length ? initialBoards : [boardId]
  );
  const [dashFilters, setDashFilters] = useState<ChartFilter[]>(initialFilters ?? []);
  const [adding, setAdding] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [dashData, setDashData] = useState<DashData | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [exportTick, setExportTick] = useState<{ id: string; n: number }>({ id: "", n: 0 });
  const [, start] = useTransition();

  // Fetch columns/values across connected boards for the dashboard filter editor.
  useEffect(() => {
    if (!boardsOpen && !filterOpen) return;
    let alive = true;
    getDashboardRows(connectedBoards).then((d) => alive && setDashData(d));
    return () => {
      alive = false;
    };
  }, [boardsOpen, filterOpen, connectedBoards]);

  // Persist widgets + connected boards + dashboard filters to the view config (DB).
  function persistAll(w: WidgetConfig[], b: string[], f: ChartFilter[]) {
    if (!readOnly) start(() => void updateViewConfig(boardId, viewId, { widgets: w, dashBoards: b, dashFilters: f }));
  }
  function persist(next: WidgetConfig[]) {
    setWidgets(next);
    persistAll(next, connectedBoards, dashFilters);
  }
  function setBoards(b: string[]) {
    const next = b.length ? b : [boardId];
    setConnectedBoards(next);
    persistAll(widgets, next, dashFilters);
  }
  function setFilters(f: ChartFilter[]) {
    setDashFilters(f);
    persistAll(widgets, connectedBoards, f);
  }
  const addWidget = (entry: (typeof WIDGET_CATALOG)[number]) => {
    setAdding(false);
    persist([
      ...widgets,
      { id: newId(entry.type), type: entry.type, title: entry.name, boardIds: [boardId], ...entry.preset },
    ]);
  };
  const updateWidget = (id: string, patch: Partial<WidgetConfig>) =>
    persist(widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const removeWidget = (id: string) => persist(widgets.filter((w) => w.id !== id));
  const duplicateWidget = (id: string) => {
    const w = widgets.find((x) => x.id === id);
    if (!w) return;
    const i = widgets.findIndex((x) => x.id === id);
    const copy = { ...w, id: newId(w.type), title: `${w.title ?? "Widget"} copy` };
    persist([...widgets.slice(0, i + 1), copy, ...widgets.slice(i + 1)]);
  };
  const move = (id: string, dir: -1 | 1) => {
    const i = widgets.findIndex((w) => w.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= widgets.length) return;
    const next = [...widgets];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };

  // Board-derived summary for preset widgets (computed client-side).
  const summary = useMemo(() => buildSummary(board), [board]);

  return (
    <div className="p-4 sm:p-6">
      {!readOnly && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* Connected boards (dashboard-level, monday-style) */}
          <div className="relative">
            <button
              onClick={() => setBoardsOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas"
            >
              🔗 {connectedBoards.length} connected board{connectedBoards.length === 1 ? "" : "s"}
            </button>
            {boardsOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setBoardsOpen(false)} />
                <div className="absolute left-0 z-30 mt-1 w-64 rounded-xl border border-hair bg-white p-1.5 shadow-pop">
                  <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Connect boards to this dashboard
                  </p>
                  <div className="max-h-64 overflow-y-auto scroll-thin">
                    {allBoards.map((b) => {
                      const on = connectedBoards.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          onClick={() => setBoards(on ? connectedBoards.filter((x) => x !== b.id) : [...connectedBoards, b.id])}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-canvas"
                        >
                          <span className={`grid h-4 w-4 flex-none place-items-center rounded border text-[10px] ${on ? "border-teal bg-teal text-white" : "border-hair text-transparent"}`}>✓</span>
                          <span className="truncate text-body">{b.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Dashboard-level filter (inherited by all widgets) */}
          <div className="relative">
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${dashFilters.length ? "border-teal/40 bg-teal/5 text-teal-deep" : "border-hair text-body hover:bg-canvas"}`}
            >
              ▽ Filter{dashFilters.length ? ` · ${dashFilters.length}` : ""}
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setFilterOpen(false)} />
                <div className="absolute left-0 z-30 mt-1 w-80 rounded-xl border border-hair bg-white p-3 shadow-pop">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Dashboard filters — applied to every widget
                  </p>
                  <FilterEditor
                    columns={dashData?.columns ?? []}
                    rows={dashData?.rows.map((r) => r.text) ?? []}
                    value={dashFilters}
                    onChange={setFilters}
                  />
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-muted">
            {widgets.length} widget{widgets.length === 1 ? "" : "s"}
          </p>

          <div className="relative ml-auto">
            <button
              onClick={() => setAdding((o) => !o)}
              className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep"
            >
              + Add Widget
            </button>
            {adding && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setAdding(false)} />
                <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-hair bg-white p-1.5 shadow-pop">
                  <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Add a widget
                  </p>
                  {WIDGET_CATALOG.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => addWidget(c)}
                      className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-canvas"
                    >
                      <span className="mt-0.5 w-4 flex-none text-center text-sm">{c.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">{c.name}</span>
                        <span className="block text-[11px] text-muted">{c.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {widgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-hair py-16 text-center text-sm text-muted">
          {readOnly ? "No widgets on this dashboard." : "Empty dashboard — click + Add Widget to start."}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {widgets.map((w, i) => (
            <WidgetShell
              key={w.id}
              widget={w}
              readOnly={readOnly}
              onRename={(t) => updateWidget(w.id, { title: t })}
              onDelete={() => removeWidget(w.id)}
              onDuplicate={() => duplicateWidget(w.id)}
              onLeft={i > 0 ? () => move(w.id, -1) : undefined}
              onRight={i < widgets.length - 1 ? () => move(w.id, 1) : undefined}
              onFullscreen={() => setFullscreenId(w.id)}
              onSettings={w.type === "chart" && !readOnly ? () => setSettingsId((s) => (s === w.id ? null : w.id)) : undefined}
              onExport={w.type === "chart" ? () => setExportTick((t) => ({ id: w.id, n: t.n + 1 })) : undefined}
            >
              {w.type === "chart" ? (
                <ChartWidget
                  config={w}
                  currentBoardId={boardId}
                  allBoards={allBoards}
                  dashboardBoardIds={connectedBoards}
                  dashboardFilters={dashFilters}
                  readOnly={readOnly}
                  settingsOpen={settingsId === w.id}
                  onCloseSettings={() => setSettingsId(null)}
                  exportSignal={exportTick.id === w.id ? exportTick.n : 0}
                  onChange={(patch) => updateWidget(w.id, patch)}
                />
              ) : (
                <PresetWidget type={w.type} summary={summary} />
              )}
            </WidgetShell>
          ))}
        </div>
      )}

      {/* Full-screen widget view (monday-style) */}
      {fullscreenId && (() => {
        const w = widgets.find((x) => x.id === fullscreenId);
        if (!w) return null;
        return (
          <div className="fixed inset-0 z-[70] grid place-items-center p-4 sm:p-8">
            <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={() => setFullscreenId(null)} />
            <div className="relative z-10 flex h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-hair bg-white p-5 shadow-pop">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold text-ink">{w.title ?? "Widget"}</h2>
                <button onClick={() => setFullscreenId(null)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas">✕</button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {w.type === "chart" ? (
                  <ChartWidget
                    config={w}
                    currentBoardId={boardId}
                    allBoards={allBoards}
                    dashboardBoardIds={connectedBoards}
                    dashboardFilters={dashFilters}
                    readOnly
                    settingsOpen={false}
                    onCloseSettings={() => {}}
                    exportSignal={0}
                    onChange={() => {}}
                    large
                  />
                ) : (
                  <PresetWidget type={w.type} summary={summary} />
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── Widget shell: title + monday-style ⋯ menu ──────────────────────────────── */
function WidgetShell({
  widget,
  readOnly,
  children,
  onRename,
  onDelete,
  onDuplicate,
  onLeft,
  onRight,
  onFullscreen,
  onSettings,
  onExport,
}: {
  widget: WidgetConfig;
  readOnly: boolean;
  children: React.ReactNode;
  onRename: (t: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onFullscreen: () => void;
  onSettings?: () => void;
  onExport?: () => void;
}) {
  const isChart = widget.type === "chart";
  const [menu, setMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  function rename() {
    const n = window.prompt("Rename widget:", widget.title ?? "");
    if (n && n.trim()) onRename(n.trim());
  }
  const act = (fn?: () => void) => () => {
    setMenu(false);
    fn?.();
  };
  // Export the whole card (title + chart + legend + values) to a high-res image.
  async function exportImage(fmt: "png" | "jpeg") {
    const node = cardRef.current;
    if (!node) return;
    setExporting(true);
    try {
      const opts = { pixelRatio: 3, backgroundColor: "#ffffff", cacheBust: true };
      const dataUrl = fmt === "png" ? await toPng(node, opts) : await toJpeg(node, { ...opts, quality: 0.95 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${(widget.title ?? "widget").replace(/[^\w]+/g, "-")}.${fmt === "png" ? "png" : "jpg"}`;
      a.click();
    } catch (e) {
      console.error("[chart-export]", e);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div ref={cardRef} className={`rounded-xl border border-hair bg-white p-4 shadow-soft ${isChart ? "lg:col-span-2" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-bold text-ink">{widget.title ?? "Widget"}</h3>
        <div className="relative flex-none">
          <button
            onClick={() => setMenu((o) => !o)}
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink"
            title="Widget options"
            aria-label="Widget options"
          >
            ⋯
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg border border-hair bg-white p-1 shadow-pop">
                <MenuRow icon="⤢" label="Full screen" onClick={act(onFullscreen)} />
                {onSettings && <MenuRow icon="⚙" label="Settings" onClick={act(onSettings)} />}
                {!readOnly && <MenuRow icon="✎" label="Rename" onClick={act(rename)} />}
                {!readOnly && <MenuRow icon="⧉" label="Duplicate" onClick={act(onDuplicate)} />}
                <MenuRow icon="⊟" label="Dock this widget" disabled />
                <div className="my-1 border-t border-hair" />
                <MenuRow icon="🖼" label={exporting ? "Exporting…" : "Export as PNG"} onClick={() => { setMenu(false); void exportImage("png"); }} />
                <MenuRow icon="🖼" label="Export as JPEG" onClick={() => { setMenu(false); void exportImage("jpeg"); }} />
                {onExport && <MenuRow icon="⬇" label="Export data (CSV)" onClick={act(onExport)} />}
                {!readOnly && (onLeft || onRight) && <div className="my-1 border-t border-hair" />}
                {!readOnly && onLeft && <MenuRow icon="←" label="Move left" onClick={act(onLeft)} />}
                {!readOnly && onRight && <MenuRow icon="→" label="Move right" onClick={act(onRight)} />}
                {!readOnly && (
                  <>
                    <div className="my-1 border-t border-hair" />
                    <MenuRow icon="🗑" label="Delete" onClick={act(onDelete)} danger />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm ${
        disabled
          ? "cursor-not-allowed text-muted/40"
          : danger
          ? "text-danger hover:bg-danger/10"
          : "text-body hover:bg-canvas"
      }`}
    >
      <span className="w-4 flex-none text-center text-muted">{icon}</span>
      {label}
    </button>
  );
}

/* ── Chart widget (configurable, multi-board, stacked series) ───────────────── */
type ChartDraft = Pick<
  WidgetConfig,
  "chartType" | "boardIds" | "xColumn" | "groupBy" | "yAgg" | "yColumn" | "filters" | "boardFilters"
>;

function passOne(v: string, f: ChartFilter): boolean {
  const val = f.value ?? "";
  const val2 = f.value2 ?? "";
  switch (f.op ?? "is") {
    case "anything":
      return true;
    case "empty":
      return v === "";
    case "not_empty":
      return v !== "";
    case "is":
    case "is_only":
      return v === val;
    case "is_not":
      return v !== val;
    case "after":
      return v !== "" && v > val;
    case "on_or_after":
      return v !== "" && v >= val;
    case "before":
      return v !== "" && v < val;
    case "on_or_before":
      return v !== "" && v <= val;
    case "between":
      return v !== "" && (!val || v >= val) && (!val2 || v <= val2);
    case "in_next": {
      if (v === "") return false;
      const days = Number(val) || 0;
      return v >= isoToday() && v <= isoAddDays(days);
    }
    case "in_last": {
      if (v === "") return false;
      const days = Number(val) || 0;
      return v >= isoAddDays(-days) && v <= isoToday();
    }
    default:
      return true;
  }
}

function rowsPass(text: Record<string, string>, filters: ChartFilter[] | undefined): boolean {
  for (const f of filters ?? []) {
    if (!passOne(text[f.column] ?? "", f)) return false;
  }
  return true;
}

// Unified chart model: X categories × stacked series with an aggregated matrix.
type ChartModel = {
  categories: string[];
  series: { name: string; color: string }[];
  matrix: number[][]; // [category][series]
};

function ChartWidget({
  config,
  currentBoardId,
  allBoards,
  dashboardBoardIds,
  dashboardFilters,
  readOnly,
  settingsOpen,
  onCloseSettings,
  exportSignal,
  onChange,
  large,
}: {
  config: WidgetConfig;
  currentBoardId: string;
  allBoards: { id: string; name: string }[];
  dashboardBoardIds?: string[];
  dashboardFilters?: ChartFilter[];
  readOnly: boolean;
  settingsOpen: boolean;
  onCloseSettings: () => void;
  exportSignal: number;
  onChange: (patch: Partial<WidgetConfig>) => void;
  large?: boolean;
}) {
  const [draft, setDraft] = useState<ChartDraft>(config);
  // Seed the draft from the saved config whenever Settings (re)opens.
  useEffect(() => {
    if (settingsOpen) setDraft(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  const active: WidgetConfig = settingsOpen ? { ...config, ...draft } : config;
  // Boards: the widget's own selection overrides; else inherit the dashboard's
  // connected boards; else fall back to the current board.
  const boardIds = active.boardIds?.length
    ? active.boardIds
    : dashboardBoardIds?.length
    ? dashboardBoardIds
    : [currentBoardId];
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getDashboardRows(boardIds)
      .then((d) => alive && setData(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardIds.join(",")]);

  const chartType = active.chartType ?? "column";
  const xColumn = active.xColumn ?? "";
  const groupBy = active.groupBy ?? "";
  const yAgg = active.yAgg ?? "count";
  const yColumn = active.yColumn ?? "";

  const model = useMemo<ChartModel>(() => {
    if (!data) return { categories: [], series: [], matrix: [] };
    const rows = data.rows.filter(
      (r) =>
        rowsPass(r.text, dashboardFilters) &&
        rowsPass(r.text, active.filters) &&
        rowsPass(r.text, active.boardFilters?.[r.boardId])
    );
    const catKeys: string[] = [];
    const serKeys: string[] = [];
    const bucket = new Map<string, { values: number[]; count: number }>();
    for (const r of rows) {
      const cat = xColumn ? r.text[xColumn] || "(blank)" : "All";
      const ser = groupBy ? r.text[groupBy] || "(blank)" : "Value";
      if (!catKeys.includes(cat)) catKeys.push(cat);
      if (!serKeys.includes(ser)) serKeys.push(ser);
      const k = `${cat} ${ser}`;
      const b = bucket.get(k) ?? { values: [], count: 0 };
      b.count += 1;
      if (yColumn && r.num[yColumn] != null) b.values.push(r.num[yColumn]);
      bucket.set(k, b);
    }
    // Limit categories/series for readability.
    const categories = catKeys.slice(0, 40);
    const series = serKeys.slice(0, 12).map((name, i) => ({ name, color: PALETTE[i % PALETTE.length] }));
    const agg = (b?: { values: number[]; count: number }) => {
      if (!b) return 0;
      return Math.round(aggregate(b.values, b.count, yAgg) * 100) / 100;
    };
    const matrix = categories.map((cat) => series.map((s) => agg(bucket.get(`${cat} ${s.name}`))));
    return { categories, series, matrix };
  }, [data, xColumn, groupBy, yAgg, yColumn, active.filters, active.boardFilters, dashboardFilters]);

  const hasData = model.categories.length > 0 && model.matrix.some((row) => row.some((v) => v > 0));

  // Export CSV when the shell's ⋯ → Export bumps the signal.
  const lastExport = useRef(0);
  useEffect(() => {
    if (exportSignal && exportSignal !== lastExport.current) {
      lastExport.current = exportSignal;
      const header = [xColumn || "Group", ...model.series.map((s) => s.name)];
      const lines = [
        header.map((h) => `"${h.replace(/"/g, '""')}"`).join(","),
        ...model.categories.map((c, ci) => [`"${c.replace(/"/g, '""')}"`, ...model.matrix[ci]].join(",")),
      ];
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(config.title ?? "chart").replace(/[^\w]+/g, "-")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [exportSignal, model, xColumn, config.title]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span className="rounded-full bg-canvas px-2 py-0.5">
          {boardIds.length > 1 ? `${boardIds.length} boards` : allBoards.find((b) => b.id === boardIds[0])?.name ?? "This board"}
        </span>
        <span>
          {xColumn || "—"} · {yAgg === "count" ? "count" : `${yAgg} of ${yColumn || "—"}`}
          {groupBy ? ` · by ${groupBy}` : ""}
        </span>
      </div>

      {settingsOpen && !readOnly && (
        <ChartSettings
          draft={draft}
          data={data}
          allBoards={allBoards}
          currentBoardId={currentBoardId}
          update={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onApply={() => {
            onChange(draft);
            onCloseSettings();
          }}
          onCancel={onCloseSettings}
        />
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-muted">Loading…</p>
      ) : !xColumn ? (
        <EmptyChart hint="Open ⚙ Settings and choose an X-axis column." />
      ) : !hasData ? (
        <EmptyChart hint="No results were found. Check your settings & filters." />
      ) : (
        <ChartCanvas
          type={chartType}
          model={model}
          large={large}
          yLabel={yAgg === "count" ? "Count" : yAgg}
          people={
            data?.columns.find((c) => c.name === xColumn)?.type === "person" ? data.people : undefined
          }
        />
      )}
    </div>
  );
}

function EmptyChart({ hint }: { hint: string }) {
  return (
    <div className="grid place-items-center py-12 text-center">
      <div className="mb-2 flex items-end gap-1" aria-hidden>
        <span className="h-6 w-2.5 rounded-sm bg-grass/50" />
        <span className="h-9 w-2.5 rounded-sm bg-teal/50" />
        <span className="h-5 w-2.5 rounded-sm bg-grass/50" />
      </div>
      <p className="text-sm font-medium text-body">No results were found</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

const selCls = "w-full rounded-lg border border-hair bg-white px-2 py-1.5 text-xs outline-none focus:border-teal";

function ChartSettings({
  draft,
  data,
  allBoards,
  currentBoardId,
  update,
  onApply,
  onCancel,
}: {
  draft: ChartDraft;
  data: DashData | null;
  allBoards: { id: string; name: string }[];
  currentBoardId: string;
  update: (patch: Partial<ChartDraft>) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const boardIds = draft.boardIds?.length ? draft.boardIds : [currentBoardId];
  const columns = data?.columns ?? [];
  const numberColumns = columns.filter((c) => c.type === "number");

  const toggleBoard = (id: string) => {
    const on = boardIds.includes(id);
    const next = on ? boardIds.filter((x) => x !== id) : [...boardIds, id];
    update({ boardIds: next.length ? next : [id] });
  };

  return (
    <div className="mb-3 rounded-lg border border-hair bg-canvas/50 p-3">
      {/* Chart type / X / Y */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Chart type">
          <select className={selCls} value={draft.chartType ?? "column"} onChange={(e) => update({ chartType: e.target.value as ChartType })}>
            {(["column", "bar", "line", "area", "pie", "donut", "bubble"] as ChartType[]).map((t) => (
              <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </Field>
        <Field label="X-axis">
          <select className={selCls} value={draft.xColumn ?? ""} onChange={(e) => update({ xColumn: e.target.value })}>
            <option value="">— choose column —</option>
            {columns.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Group by / stack (optional)">
          <select className={selCls} value={draft.groupBy ?? ""} onChange={(e) => update({ groupBy: e.target.value })}>
            <option value="">— none —</option>
            {columns.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Y-axis">
          <select className={selCls} value={draft.yAgg ?? "count"} onChange={(e) => update({ yAgg: e.target.value as YAgg })}>
            <option value="count">Count of items</option>
            <option value="sum">Sum</option>
            <option value="average">Average</option>
            <option value="median">Median</option>
            <option value="min">Min</option>
            <option value="max">Max</option>
          </select>
        </Field>
        {draft.yAgg && draft.yAgg !== "count" && (
          <Field label="Number column">
            <select className={selCls} value={draft.yColumn ?? ""} onChange={(e) => update({ yColumn: e.target.value })}>
              <option value="">— choose —</option>
              {numberColumns.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {/* Boards (multi-board) */}
      <div className="mt-3">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Boards — combine data</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {allBoards.map((b) => {
            const on = boardIds.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => toggleBoard(b.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${on ? "border-teal bg-teal/10 text-teal-deep" : "border-hair text-muted hover:border-teal/40"}`}
              >
                {on ? "✓ " : ""}{b.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Global filters */}
      <div className="mt-3">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Filters (all boards)</span>
        <FilterEditor
          columns={columns}
          rows={data?.rows.map((r) => r.text) ?? []}
          value={draft.filters ?? []}
          onChange={(filters) => update({ filters })}
        />
      </div>

      {/* Per-board filters (§5F) */}
      {boardIds.length > 0 && data && (
        <div className="mt-3">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Per-board filters</span>
          <div className="mt-1 flex flex-col gap-2">
            {boardIds.map((bid) => {
              const meta = data.boards.find((b) => b.id === bid);
              if (!meta) return null;
              return (
                <div key={bid} className="rounded-lg border border-hair bg-white p-2">
                  <p className="mb-1 text-[11px] font-semibold text-body">{meta.name}</p>
                  <FilterEditor
                    columns={meta.columns}
                    rows={data.rows.filter((r) => r.boardId === bid).map((r) => r.text)}
                    value={draft.boardFilters?.[bid] ?? []}
                    onChange={(f) => update({ boardFilters: { ...(draft.boardFilters ?? {}), [bid]: f } })}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-hair px-3 py-1.5 text-xs text-body hover:bg-canvas">Cancel</button>
        <button onClick={onApply} className="rounded-lg bg-teal px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep">Apply</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

// Operator sets. Date columns get monday's full set; others get the common ones.
const OP_LABEL: Record<FilterOp, string> = {
  is: "Is",
  is_not: "Is not",
  in_next: "In the next",
  in_last: "In the last",
  between: "Is between",
  on_or_after: "Is on or after",
  after: "Is after",
  on_or_before: "Is on or before",
  before: "Is before",
  empty: "Is empty",
  not_empty: "Is not empty",
  is_only: "Is only",
  anything: "Is anything",
};
const DATE_OPS: FilterOp[] = [
  "is", "is_not", "in_next", "in_last", "between", "on_or_after", "after",
  "on_or_before", "before", "empty", "not_empty", "is_only", "anything",
];
const TEXT_OPS: FilterOp[] = ["is", "is_not", "empty", "not_empty", "anything"];

// Which inputs an operator needs.
function inputKind(op: FilterOp, isDate: boolean): "none" | "one" | "two" | "days" {
  if (op === "empty" || op === "not_empty" || op === "anything") return "none";
  if (op === "between") return "two";
  if (op === "in_next" || op === "in_last") return "days";
  void isDate;
  return "one";
}

function filterLabel(f: ChartFilter): string {
  const op = f.op ?? "is";
  const lbl = OP_LABEL[op];
  if (op === "empty" || op === "not_empty" || op === "anything") return `${f.column} · ${lbl}`;
  if (op === "between") return `${f.column} · ${lbl} ${f.value || "…"}–${f.value2 || "…"}`;
  if (op === "in_next" || op === "in_last") return `${f.column} · ${lbl} ${f.value || "0"} days`;
  return `${f.column} · ${lbl} ${f.value ?? ""}`;
}

// Reusable filter editor — dynamic operator + inputs (monday-style date operators).
function FilterEditor({
  columns,
  rows,
  value,
  onChange,
}: {
  columns: { name: string; type: string }[];
  rows: Record<string, string>[];
  value: ChartFilter[];
  onChange: (f: ChartFilter[]) => void;
}) {
  const [col, setCol] = useState(columns[0]?.name ?? "");
  const colType = columns.find((c) => c.name === col)?.type ?? "text";
  const isDate = colType === "date";
  const ops = isDate ? DATE_OPS : TEXT_OPS;
  const [op, setOp] = useState<FilterOp>("is");
  const [v1, setV1] = useState("");
  const [v2, setV2] = useState("");

  // Keep the operator valid when the column type changes.
  const opValid = ops.includes(op);
  const effectiveOp = opValid ? op : ops[0];
  const kind = inputKind(effectiveOp, isDate);

  const distinct = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r[col]) s.add(r[col]);
    return [...s].slice(0, 200).sort();
  }, [rows, col]);

  function add() {
    if (!col) return;
    if (kind === "one" && !v1.trim()) return;
    if (kind === "days" && !v1.trim()) return;
    if (kind === "two" && !v1 && !v2) return;
    const f: ChartFilter = { column: col, op: effectiveOp };
    if (kind === "one" || kind === "days") f.value = v1.trim();
    if (kind === "two") {
      f.value = v1;
      f.value2 = v2;
    }
    onChange([...value, f]);
    setV1("");
    setV2("");
  }

  const listId = `dl-${col.replace(/\W/g, "")}-${rows.length}`;
  return (
    <div>
      {value.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {value.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2 py-0.5 text-[11px] text-teal-deep">
              {filterLabel(f)}
              <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="hover:text-danger">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          className={`${selCls} min-w-[96px] flex-1`}
          value={col}
          onChange={(e) => {
            setCol(e.target.value);
            setV1("");
            setV2("");
          }}
        >
          {columns.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select className={`${selCls} min-w-[92px] flex-1`} value={effectiveOp} onChange={(e) => setOp(e.target.value as FilterOp)}>
          {ops.map((o) => (
            <option key={o} value={o}>{OP_LABEL[o]}</option>
          ))}
        </select>
        {/* Dynamic value input(s) by operator */}
        {kind === "days" && (
          <span className="flex flex-1 items-center gap-1">
            <input type="number" min={0} className={`${selCls} w-16`} value={v1} onChange={(e) => setV1(e.target.value)} placeholder="N" />
            <span className="text-[11px] text-muted">days</span>
          </span>
        )}
        {kind === "one" &&
          (isDate ? (
            <input type="date" className={`${selCls} flex-1`} value={v1} onChange={(e) => setV1(e.target.value)} />
          ) : (
            <>
              <input className={`${selCls} flex-1`} list={listId} value={v1} onChange={(e) => setV1(e.target.value)} placeholder="value" />
              <datalist id={listId}>
                {distinct.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </>
          ))}
        {kind === "two" && (
          <>
            <input type="date" className={`${selCls} flex-1`} value={v1} onChange={(e) => setV1(e.target.value)} />
            <span className="text-[11px] text-muted">→</span>
            <input type="date" className={`${selCls} flex-1`} value={v2} onChange={(e) => setV2(e.target.value)} />
          </>
        )}
        <button onClick={add} className="flex-none rounded-lg bg-teal px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep">
          Add
        </button>
      </div>
    </div>
  );
}

/* ── Chart renderers (SVG) — stacked series + legend, monday-style ──────────── */
function trunc(s: string, n = 10) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function Legend({ series, values }: { series: { name: string; color: string }[]; values?: number[] }) {
  if (series.length <= 1 && series[0]?.name === "Value") return null;
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
      {series.map((s, i) => (
        <span key={i} className="flex items-center gap-1.5 text-[11px] text-body">
          <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color }} />
          <span className="truncate" title={s.name}>
            {s.name}
            {values ? <span className="font-semibold text-ink">: {values[i]}</span> : ""}
          </span>
        </span>
      ))}
    </div>
  );
}

// Round an axis max up to a clean number so gridlines read nicely.
function niceMax(m: number): number {
  if (m <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(m)));
  const n = m / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

type People = Record<string, DashPerson>;

// SVG axis avatar: profile photo (clipped circle) or a coloured initials circle.
function AxisAvatar({ cx, cy, r, person }: { cx: number; cy: number; r: number; person?: DashPerson }) {
  const clip = `clip-${cx}-${cy}`;
  if (person?.avatarUrl) {
    return (
      <g>
        <clipPath id={clip}>
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
        <image href={person.avatarUrl} x={cx - r} y={cy - r} width={r * 2} height={r * 2} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-hair)" />
      </g>
    );
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={person?.color ?? "#8792A2"} />
      <text x={cx} y={cy + 3} textAnchor="middle" style={{ fontSize: r * 0.8, fontWeight: 700 }} className="fill-white">
        {person?.initials ?? "•"}
      </text>
    </g>
  );
}

function ChartCanvas({
  type,
  model,
  large,
  yLabel,
  people,
}: {
  type: ChartType;
  model: ChartModel;
  large?: boolean;
  yLabel: string;
  people?: People;
}) {
  const totals = model.categories.map((_, ci) => model.matrix[ci].reduce((s, v) => s + v, 0));
  if (type === "pie" || type === "donut") return <PieChart model={model} donut={type === "donut"} totals={totals} />;
  if (type === "bar") return <StackedBar model={model} totals={totals} large={large} people={people} />;
  if (type === "line" || type === "area") return <LineChart model={model} area={type === "area"} large={large} yLabel={yLabel} />;
  if (type === "bubble") return <BubbleChart model={model} totals={totals} large={large} />;
  return <StackedColumn model={model} totals={totals} large={large} yLabel={yLabel} people={people} />;
}

function StackedColumn({ model, totals, large, yLabel, people }: { model: ChartModel; totals: number[]; large?: boolean; yLabel: string; people?: People }) {
  const max = niceMax(Math.max(1, ...totals));
  const cats = model.categories;
  const band = 58; // px per category
  const padL = 40, padT = 16;
  const padB = people ? 78 : 64; // extra room for avatar + name
  const plotH = (large ? 360 : 240) - padT - padB;
  const h = plotH + padT + padB;
  const w = Math.max(560, padL + cats.length * band + 12);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = 4;
  const longLabels = cats.some((c) => c.length > 6);
  return (
    <div>
      <div className="overflow-x-auto">
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="min-w-full">
          {/* gridlines + Y ticks */}
          {Array.from({ length: ticks + 1 }).map((_, i) => {
            const val = (max / ticks) * i;
            const yy = y(val);
            return (
              <g key={i}>
                <line x1={padL} y1={yy} x2={w - 6} y2={yy} stroke="var(--color-hair)" strokeWidth="1" />
                <text x={padL - 6} y={yy + 3} textAnchor="end" style={{ fontSize: 9 }} className="fill-muted tabular-nums">
                  {Math.round(val)}
                </text>
              </g>
            );
          })}
          {/* bars */}
          {cats.map((cat, ci) => {
            const bx = padL + ci * band + band * 0.22;
            const bw = band * 0.56;
            const cx = bx + bw / 2;
            let acc = 0;
            return (
              <g key={ci}>
                {model.series.map((s, si) => {
                  const v = model.matrix[ci][si];
                  if (!v) return null;
                  const segH = (v / max) * plotH;
                  const yy = y(acc + v);
                  acc += v;
                  return (
                    <g key={si}>
                      <rect x={bx} y={yy} width={bw} height={Math.max(0.5, segH)} fill={s.color}>
                        <title>{s.name}: {v}</title>
                      </rect>
                      {segH > 11 && (
                        <text x={cx} y={yy + segH / 2 + 3} textAnchor="middle" style={{ fontSize: 9, fontWeight: 700 }} className="fill-white">
                          {v}
                        </text>
                      )}
                    </g>
                  );
                })}
                {totals[ci] > 0 && (
                  <text x={cx} y={y(totals[ci]) - 4} textAnchor="middle" style={{ fontSize: 9, fontWeight: 700 }} className="fill-body tabular-nums">
                    {totals[ci]}
                  </text>
                )}
                {people ? (
                  <>
                    <AxisAvatar cx={cx} cy={h - padB + 16} r={11} person={people[cat]} />
                    <text x={cx} y={h - padB + 38} textAnchor="middle" style={{ fontSize: 8 }} className="fill-muted">
                      {trunc(cat, 10)}
                    </text>
                  </>
                ) : (
                  <text
                    x={cx}
                    y={h - padB + 12}
                    textAnchor={longLabels ? "end" : "middle"}
                    transform={longLabels ? `rotate(-35 ${cx} ${h - padB + 12})` : undefined}
                    style={{ fontSize: 9 }}
                    className="fill-muted"
                  >
                    {trunc(cat, 16)}
                  </text>
                )}
              </g>
            );
          })}
          {/* axis line + Y label */}
          <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="var(--color-hair)" />
          <text x={12} y={padT + plotH / 2} textAnchor="middle" transform={`rotate(-90 12 ${padT + plotH / 2})`} style={{ fontSize: 9 }} className="fill-muted">
            {yLabel}
          </text>
        </svg>
      </div>
      <Legend series={model.series} />
    </div>
  );
}

function StackedBar({ model, totals, large, people }: { model: ChartModel; totals: number[]; large?: boolean; people?: People }) {
  const max = Math.max(1, ...totals);
  return (
    <div>
      <div className={`flex flex-col gap-2 overflow-y-auto ${large ? "max-h-[360px]" : "max-h-64"}`}>
        {model.categories.map((cat, ci) => (
          <div key={ci} className="flex items-center gap-3">
            <span className="flex w-28 flex-none items-center gap-1.5 truncate text-xs text-body" title={cat}>
              {people &&
                (people[cat]?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={people[cat]!.avatarUrl} alt="" className="h-5 w-5 flex-none rounded-full object-cover" />
                ) : (
                  <span
                    className="grid h-5 w-5 flex-none place-items-center rounded-full text-[8px] font-bold text-white"
                    style={{ background: people[cat]?.color ?? "#8792A2" }}
                  >
                    {people[cat]?.initials ?? "•"}
                  </span>
                ))}
              <span className="truncate">{cat}</span>
            </span>
            <div className="flex h-5 flex-1 overflow-hidden rounded-md bg-canvas" style={{ width: `${(totals[ci] / max) * 100}%`, minWidth: 24 }}>
              {model.series.map((s, si) => {
                const v = model.matrix[ci][si];
                if (!v) return null;
                return <div key={si} className="flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${(v / (totals[ci] || 1)) * 100}%`, background: s.color }} title={`${s.name}: ${v}`}>{(v / max) * 100 > 6 ? v : ""}</div>;
              })}
            </div>
            <span className="w-8 flex-none text-right text-[10px] font-semibold text-ink tabular-nums">{totals[ci]}</span>
          </div>
        ))}
      </div>
      <Legend series={model.series} />
    </div>
  );
}

function LineChart({ model, area, large, yLabel }: { model: ChartModel; area: boolean; large?: boolean; yLabel: string }) {
  const w = 640, h = 220, pad = 30;
  const max = niceMax(Math.max(1, ...model.matrix.flat()));
  const n = model.categories.length;
  const x = (i: number) => (n <= 1 ? w / 2 : pad + (i * (w - pad * 2)) / (n - 1));
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const ticks = 4;
  return (
    <div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className={`w-full min-w-[440px] ${large ? "h-80" : "h-56"}`}>
          {Array.from({ length: ticks + 1 }).map((_, i) => {
            const val = (max / ticks) * i;
            const yy = y(val);
            return (
              <g key={`g${i}`}>
                <line x1={pad} y1={yy} x2={w - pad} y2={yy} stroke="var(--color-hair)" strokeWidth="1" />
                <text x={pad - 4} y={yy + 3} textAnchor="end" style={{ fontSize: 8 }} className="fill-muted tabular-nums">{Math.round(val)}</text>
              </g>
            );
          })}
          <text x={10} y={(h - pad * 2) / 2 + pad} textAnchor="middle" transform={`rotate(-90 10 ${(h - pad * 2) / 2 + pad})`} style={{ fontSize: 9 }} className="fill-muted">{yLabel}</text>
          {model.series.map((s, si) => {
            const pts = model.categories.map((_, ci) => `${x(ci)},${y(model.matrix[ci][si])}`).join(" ");
            const areaPath = `M ${x(0)},${h - pad} L ${model.categories.map((_, ci) => `${x(ci)},${y(model.matrix[ci][si])}`).join(" L ")} L ${x(n - 1)},${h - pad} Z`;
            return (
              <g key={si}>
                {area && <path d={areaPath} fill={s.color} opacity="0.14" />}
                <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2.5" />
                {model.categories.map((_, ci) => (
                  <circle key={ci} cx={x(ci)} cy={y(model.matrix[ci][si])} r="3" fill={s.color} />
                ))}
              </g>
            );
          })}
          {model.categories.map((c, ci) => (
            <text key={ci} x={x(ci)} y={h - 8} textAnchor="middle" className="fill-muted" style={{ fontSize: 9 }}>{trunc(c, 8)}</text>
          ))}
        </svg>
      </div>
      <p className="mt-1 text-center text-[9px] uppercase tracking-wide text-muted">{yLabel}</p>
      <Legend series={model.series} />
    </div>
  );
}

// Pie/Donut — slices by series (when grouped) else by category.
function PieChart({ model, donut, totals }: { model: ChartModel; donut: boolean; totals: number[] }) {
  const grouped = model.series.length > 1;
  const slices = grouped
    ? model.series.map((s, si) => ({ label: s.name, value: model.matrix.reduce((sum, row) => sum + row[si], 0), color: s.color }))
    : model.categories.map((c, ci) => ({ label: c, value: totals[ci], color: PALETTE[ci % PALETTE.length] }));
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const r = 80, cx = 100, cy = 100;
  const arcs = slices.reduce<{ p: string; color: string }[]>((acc, d) => {
    const a0 = -Math.PI / 2 + (acc.reduce((s, _, i) => s + slices[i].value, 0) / total) * Math.PI * 2;
    const frac = d.value / total;
    const a1 = a0 + frac * Math.PI * 2;
    const lg = frac > 0.5 ? 1 : 0;
    acc.push({ p: `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${lg} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`, color: d.color });
    return acc;
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 200 200" className="h-48 w-48 flex-none">
        {arcs.map((a, i) => <path key={i} d={a.p} fill={a.color} />)}
        {donut && <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--color-surface,#fff)" />}
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {slices.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate text-body" title={d.label}>{d.label}</span>
            <span className="font-semibold text-ink tabular-nums">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BubbleChart({ model, totals, large }: { model: ChartModel; totals: number[]; large?: boolean }) {
  const max = Math.max(1, ...totals);
  const w = 640, h = 220, pad = 34;
  const n = model.categories.length;
  const x = (i: number) => (n <= 1 ? w / 2 : pad + (i * (w - pad * 2)) / (n - 1));
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className={`w-full min-w-[440px] ${large ? "h-80" : "h-56"}`}>
        {model.categories.map((c, ci) => (
          <g key={ci}>
            <circle cx={x(ci)} cy={h / 2} r={8 + (totals[ci] / max) * 40} fill={PALETTE[ci % PALETTE.length]} opacity="0.65" />
            <text x={x(ci)} y={h - 8} textAnchor="middle" className="fill-muted" style={{ fontSize: 9 }}>{trunc(c, 8)}</text>
            <text x={x(ci)} y={h / 2 + 3} textAnchor="middle" className="fill-white" style={{ fontSize: 10, fontWeight: 700 }}>{totals[ci]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ── Preset (board-derived) widgets ─────────────────────────────────────────── */
type Bar = { label: string; value: number; color: string };
type Summary = {
  total: number;
  groups: Bar[];
  status: { label: string; color: string; count: number }[];
  doneRate: number;
};

function buildSummary(board: BoardData): Summary {
  const items = board.groups.flatMap((g) => g.items);
  const statusCol = board.columns.find((c) => c.type === "status");
  const status: { label: string; color: string; count: number }[] = [];
  let done = 0;
  if (statusCol) {
    const counts = new Map<string, { label: string; color: string; count: number }>();
    for (const it of items) {
      const v = it.cells[statusCol.id]?.value;
      const lab = statusCol.labels.find((l) => l.id === v);
      if (!lab) continue;
      const cur = counts.get(lab.id) ?? { label: lab.label, color: lab.color, count: 0 };
      cur.count += 1;
      counts.set(lab.id, cur);
      if (lab.label.toLowerCase() === "done") done += 1;
    }
    status.push(...counts.values());
  }
  return {
    total: items.length,
    groups: board.groups.map((g) => ({ label: g.name, value: g.items.length, color: g.color })),
    status,
    doneRate: items.length ? Math.min(100, Math.round((done / items.length) * 100)) : 0,
  };
}

function PresetWidget({ type, summary }: { type: WidgetConfig["type"]; summary: Summary }) {
  if (type === "numbers") {
    return (
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Items" value={summary.total} accent="#0B7A6F" />
        <Stat label="Groups" value={summary.groups.length} accent="#5B7A99" />
        <Stat label="Done %" value={`${summary.doneRate}%`} accent="#2E9C63" />
      </div>
    );
  }
  if (type === "progress") {
    return (
      <div className="flex items-center gap-4">
        <Ring pct={summary.doneRate} />
        <div>
          <p className="text-2xl font-extrabold text-ink tabular-nums">{summary.doneRate}%</p>
          <p className="text-xs text-muted">of items marked done</p>
        </div>
      </div>
    );
  }
  if (type === "battery") {
    const total = summary.status.reduce((s, d) => s + d.count, 0) || 1;
    return summary.status.length === 0 ? (
      <Empty />
    ) : (
      <div>
        <div className="flex h-7 w-full overflow-hidden rounded-lg">
          {summary.status.map((d, i) => (
            <div key={i} className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${(d.count / total) * 100}%`, background: d.color }} title={`${d.label}: ${d.count}`}>
              {(d.count / total) * 100 > 8 ? `${Math.round((d.count / total) * 100)}%` : ""}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {summary.status.map((d, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
              <span className="text-body">{d.label}</span>
              <span className="font-semibold text-ink tabular-nums">{d.count}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }
  // activity → items per group (simple horizontal bars)
  if (summary.groups.length === 0) return <Empty />;
  const max = Math.max(1, ...summary.groups.map((g) => g.value));
  return (
    <div className="flex flex-col gap-2">
      {summary.groups.map((g, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-28 flex-none truncate text-xs text-body" title={g.label}>{g.label}</span>
          <div className="h-5 flex-1 overflow-hidden rounded-md bg-canvas">
            <div className="flex h-full items-center justify-end rounded-md px-2 text-[10px] font-bold text-white" style={{ width: `${(g.value / max) * 100}%`, background: g.color, minWidth: 22 }}>{g.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className="rounded-xl border border-hair bg-canvas/40 p-3.5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink tabular-nums">{value}</p>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--color-canvas)" strokeWidth="10" />
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--color-grass,#2E9C63)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} />
    </svg>
  );
}

function Empty() {
  return <p className="py-6 text-center text-sm text-muted">No data</p>;
}
