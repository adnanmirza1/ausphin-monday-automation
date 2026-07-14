"use client";

import { useEffect, useState } from "react";

// Customisable dashboard (Improvement #4). The server passes all aggregates;
// the user arranges widgets with "+ Add Widget" and the layout is saved in the
// browser (per user). Widget types: Numbers, Battery/Progress, Charts,
// Data Over Time, Activity Analytics, Workspaces.

export type Series = { label: string; value: number; color?: string };
export type StatusDatum = { label: string; color: string; count: number };

export type DashData = {
  kpis: { boards: number; items: number; done: number; completion: number; people: number };
  status: StatusDatum[];
  boards: Series[];
  owners: Series[];
  workspaces: Series[];
  overTime: Series[];
  activity: { totalUpdates: number; series: Series[] };
};

type WidgetType =
  | "numbers"
  | "battery"
  | "chart-status"
  | "chart-board"
  | "chart-owner"
  | "overtime"
  | "activity"
  | "workspaces";

const CATALOG: { id: WidgetType; name: string; desc: string; icon: string; span: 1 | 2 }[] = [
  { id: "numbers", name: "Numbers", desc: "Headline KPIs", icon: "#", span: 2 },
  { id: "battery", name: "Battery / Progress", desc: "Status progress bar", icon: "▰", span: 2 },
  { id: "chart-status", name: "Status chart", desc: "Distribution donut + bars", icon: "◐", span: 1 },
  { id: "chart-board", name: "Items per board", desc: "Workload by board", icon: "▦", span: 1 },
  { id: "chart-owner", name: "Top owners", desc: "Assigned items by person", icon: "@", span: 1 },
  { id: "overtime", name: "Data over time", desc: "Items created per month", icon: "📈", span: 2 },
  { id: "activity", name: "Activity analytics", desc: "Updates over recent weeks", icon: "⚡", span: 1 },
  { id: "workspaces", name: "Workspaces", desc: "Boards per workspace", icon: "▤", span: 1 },
];

const DEFAULT: WidgetType[] = [
  "numbers",
  "battery",
  "chart-status",
  "overtime",
  "chart-board",
  "activity",
];
const LS_KEY = "oswin-dashboard-widgets-v1";

export function DashboardCanvas({ data }: { data: DashData }) {
  const [widgets, setWidgets] = useState<WidgetType[]>(DEFAULT);
  const [mounted, setMounted] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setWidgets(parsed.filter((w) => CATALOG.some((c) => c.id === w)));
      }
    } catch {}
  }, []);

  function save(next: WidgetType[]) {
    setWidgets(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {}
  }
  const add = (id: WidgetType) => { save([...widgets, id]); setAdding(false); };
  const removeAt = (i: number) => save(widgets.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= widgets.length) return;
    const next = [...widgets];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  // Avoid hydration mismatch — render nothing until localStorage is read.
  if (!mounted) return <div className="mt-4 h-40" />;

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted">{widgets.length} widget{widgets.length === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-2">
          {widgets.length !== DEFAULT.length && (
            <button
              onClick={() => save(DEFAULT)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:text-ink"
            >
              Reset
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setAdding((o) => !o)}
              className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep"
            >
              + Add Widget
            </button>
            {adding && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setAdding(false)} />
                <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-hair bg-white p-1.5 shadow-pop">
                  <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Add a widget
                  </p>
                  {CATALOG.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => add(c.id)}
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
      </div>

      {widgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-hair py-16 text-center text-sm text-muted">
          No widgets yet. Click <b>+ Add Widget</b> to build your dashboard.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {widgets.map((id, i) => {
            const meta = CATALOG.find((c) => c.id === id)!;
            return (
              <WidgetShell
                key={`${id}-${i}`}
                title={meta.name}
                span={meta.span}
                onRemove={() => removeAt(i)}
                onLeft={i > 0 ? () => move(i, -1) : undefined}
                onRight={i < widgets.length - 1 ? () => move(i, 1) : undefined}
              >
                <WidgetBody id={id} data={data} />
              </WidgetShell>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WidgetShell({
  title,
  span,
  children,
  onRemove,
  onLeft,
  onRight,
}: {
  title: string;
  span: 1 | 2;
  children: React.ReactNode;
  onRemove: () => void;
  onLeft?: () => void;
  onRight?: () => void;
}) {
  return (
    <div className={`group rounded-xl border border-hair bg-white p-4 shadow-soft ${span === 2 ? "lg:col-span-2" : ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {onLeft && (
            <button onClick={onLeft} title="Move left" className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-canvas hover:text-ink">←</button>
          )}
          {onRight && (
            <button onClick={onRight} title="Move right" className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-canvas hover:text-ink">→</button>
          )}
          <button onClick={onRemove} title="Remove widget" className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-danger/10 hover:text-danger">✕</button>
        </div>
      </div>
      {children}
    </div>
  );
}

function WidgetBody({ id, data }: { id: WidgetType; data: DashData }) {
  switch (id) {
    case "numbers":
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Boards" value={data.kpis.boards} accent="#5B7A99" />
          <Kpi label="Items" value={data.kpis.items} accent="#0B7A6F" />
          <Kpi label="Done" value={data.kpis.done} accent="#2E9C63" />
          <Kpi label="Completion" value={`${data.kpis.completion}%`} accent="#2D6CDF" />
          <Kpi label="People" value={data.kpis.people} accent="#C67A1E" />
        </div>
      );
    case "battery":
      return data.status.length === 0 ? <Empty /> : <Battery data={data.status} />;
    case "chart-status":
      return data.status.length === 0 ? (
        <Empty />
      ) : (
        <div className="flex items-center gap-5">
          <Donut data={data.status} />
          <div className="min-w-0 flex-1">
            <BarList data={data.status.map((s) => ({ label: s.label, value: s.count, color: s.color }))} />
          </div>
        </div>
      );
    case "chart-board":
      return data.boards.length === 0 ? <Empty /> : <BarList data={data.boards} />;
    case "chart-owner":
      return data.owners.length === 0 ? <Empty /> : <BarList data={data.owners} />;
    case "workspaces":
      return data.workspaces.length === 0 ? <Empty /> : <BarList data={data.workspaces} />;
    case "overtime":
      return <ColumnChart data={data.overTime} color="#2D6CDF" />;
    case "activity":
      return (
        <div>
          <p className="mb-2 text-2xl font-extrabold tracking-tight text-ink tabular-nums">
            {data.activity.totalUpdates}
            <span className="ml-1.5 text-xs font-normal text-muted">updates · last 6 weeks</span>
          </p>
          <ColumnChart data={data.activity.series} color="#8E44AD" compact />
        </div>
      );
  }
}

/* ── presentational pieces ─────────────────────────── */
function Kpi({ label, value, accent }: { label: string; value: number | string; accent: string }) {
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

function BarList({ data }: { data: Series[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-28 flex-none truncate text-xs text-body">{d.label}</span>
          <div className="h-5 flex-1 overflow-hidden rounded-md bg-canvas">
            <div
              className="flex h-full items-center justify-end rounded-md px-2 text-[10px] font-bold text-white"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? "#5B7A99", minWidth: 22 }}
            >
              {d.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Battery({ data }: { data: StatusDatum[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  return (
    <div>
      <div className="flex h-7 w-full overflow-hidden rounded-lg">
        {data.map((d, i) => {
          const pct = (d.count / total) * 100;
          return (
            <div
              key={i}
              className="flex items-center justify-center text-[10px] font-bold text-white"
              style={{ width: `${pct}%`, background: d.color }}
              title={`${d.label}: ${d.count} (${Math.round(pct)}%)`}
            >
              {pct > 8 ? `${Math.round(pct)}%` : ""}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="text-xs text-body">{d.label}</span>
            <span className="text-xs font-semibold text-ink tabular-nums">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Donut({ data }: { data: StatusDatum[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const r = 42;
  const c = 2 * Math.PI * r;
  const segments = data.reduce<{ color: string; dash: number; offset: number }[]>((acc, d) => {
    const dash = (d.count / total) * c;
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
    acc.push({ color: d.color, dash, offset });
    return acc;
  }, []);
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="flex-none -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-canvas)" strokeWidth="16" />
      {segments.map((s, i) => (
        <circle
          key={i}
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={s.color}
          strokeWidth="16"
          strokeDasharray={`${s.dash} ${c - s.dash}`}
          strokeDashoffset={-s.offset}
        />
      ))}
      <text x="60" y="60" textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-ink text-lg font-extrabold" style={{ transformOrigin: "center" }}>
        {total}
      </text>
    </svg>
  );
}

// Simple column chart for time-series widgets (Data Over Time / Activity).
function ColumnChart({ data, color, compact }: { data: Series[]; color: string; compact?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <Empty />;
  return (
    <div className={`flex items-end gap-2 ${compact ? "h-24" : "h-40"}`}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-body tabular-nums">{d.value}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md"
              style={{ height: `${(d.value / max) * 100}%`, background: color, minHeight: d.value > 0 ? 4 : 0 }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
          <span className="text-[10px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return <p className="py-6 text-center text-sm text-muted">No data for this filter</p>;
}
