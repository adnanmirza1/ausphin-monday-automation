"use client";

import { useMemo, useState } from "react";
import type { BoardData, PersonLite } from "@/lib/board-types";

// Per-board dashboard: a configurable bar chart (x-axis = a column, y = count).
// Respects whatever filters/search are active on the board (it receives the
// already-filtered `view`).
export function ChartView({ board, people }: { board: BoardData; people: PersonLite[] }) {
  // Columns we can group by: status, person, or plain text/number/date values.
  const groupable = board.columns.filter((c) =>
    ["status", "person", "text", "number", "date", "email", "phone", "url"].includes(c.type)
  );
  const [xAxis, setXAxis] = useState<string>(
    groupable.find((c) => c.type === "status")?.id ?? groupable[0]?.id ?? "__group__"
  );

  const items = useMemo(() => board.groups.flatMap((g) => g.items), [board.groups]);

  const bars = useMemo(() => {
    const counts = new Map<string, { label: string; color: string; n: number }>();
    const col = board.columns.find((c) => c.id === xAxis);

    for (const it of items) {
      let key = "—";
      let label = "(blank)";
      let color = "#8792a2";

      if (xAxis === "__group__") {
        const g = board.groups.find((gr) => gr.items.some((i) => i.id === it.id));
        key = g?.id ?? "—";
        label = g?.name ?? "—";
        color = g?.color ?? "#8792a2";
      } else if (col?.type === "status") {
        const v = it.cells[xAxis]?.value ?? "";
        const lab = col.labels.find((l) => l.id === v);
        key = v || "__blank__";
        label = lab?.label ?? "(blank)";
        color = lab?.color ?? "#c7ced8";
      } else if (col?.type === "person") {
        const p = it.cells[xAxis]?.person;
        key = p?.id ?? "__blank__";
        label = p?.name ?? "(unassigned)";
        color = p?.avatarColor ?? "#c7ced8";
      } else {
        const v = (it.cells[xAxis]?.value ?? "").trim();
        key = v || "__blank__";
        label = v || "(blank)";
        color = "#5b7a99";
      }

      const cur = counts.get(key) ?? { label, color, n: 0 };
      cur.n++;
      counts.set(key, cur);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n);
  }, [items, xAxis, board.columns, board.groups]);

  const max = Math.max(1, ...bars.map((b) => b.n));
  void people;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted">Group by (X-axis)</span>
          <select
            value={xAxis}
            onChange={(e) => setXAxis(e.target.value)}
            className="rounded-lg border border-hair bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal"
          >
            <option value="__group__">Group</option>
            {groupable.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-muted">· Y-axis: count of items</span>
      </div>

      {/* KPI tiles */}
      <div className="mb-5 flex flex-wrap gap-3">
        <Kpi label="Total items" value={items.length} />
        <Kpi label="Categories" value={bars.length} />
        <Kpi label="Top group" value={bars[0]?.label ?? "—"} sub={bars[0] ? `${bars[0].n}` : ""} />
      </div>

      {/* Bar chart */}
      <div className="max-w-2xl rounded-2xl border border-hair bg-white p-5 shadow-soft">
        {bars.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No data to chart yet.</p>
        ) : (
          <div className="space-y-2.5">
            {bars.map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-32 flex-none truncate text-right text-xs text-body" title={b.label}>
                  {b.label}
                </span>
                <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-canvas">
                  <div
                    className="flex h-full items-center justify-end rounded-md px-2 text-[11px] font-semibold text-white transition-all"
                    style={{ width: `${(b.n / max) * 100}%`, background: b.color, minWidth: "1.5rem" }}
                  >
                    {b.n}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-hair bg-white px-4 py-3 shadow-soft">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-ink">
        {value} {sub && <span className="text-sm font-normal text-muted">· {sub}</span>}
      </p>
    </div>
  );
}
