"use client";

import { useMemo, useState } from "react";
import type { BoardData, ItemData } from "@/lib/board-types";
import { useBoardUI } from "./board-ui";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function CalendarView({ board }: { board: BoardData; readOnly: boolean }) {
  const dateCols = board.columns.filter((c) => c.type === "date");
  const [dateColId, setDateColId] = useState(dateCols[0]?.id ?? "");
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const { open } = useBoardUI();

  const statusCol = board.columns.find((c) => c.type === "status");

  // Map date string → items scheduled on it.
  const byDate = useMemo(() => {
    const map = new Map<string, ItemData[]>();
    if (!dateColId) return map;
    for (const g of board.groups) {
      for (const it of g.items) {
        const v = it.cells[dateColId]?.value;
        if (!v) continue;
        const key = v.slice(0, 10);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(it);
      }
    }
    return map;
  }, [board.groups, dateColId]);

  const itemColor = (it: ItemData) => {
    if (!statusCol) return "#5B7A99";
    const v = it.cells[statusCol.id]?.value;
    return statusCol.labels.find((l) => l.id === v)?.color ?? "#9AA4B2";
  };

  if (dateCols.length === 0) {
    return (
      <div className="grid h-full place-items-center p-8 text-sm text-muted">
        Add a <b className="mx-1">date</b> column to use the Calendar view.
      </div>
    );
  }

  // Build the month grid (6 weeks from the Sunday on/before the 1st).
  const first = new Date(cursor.y, cursor.m, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  const todayKey = ymd(today);

  function shift(delta: number) {
    setCursor((c) => {
      const m = c.m + delta;
      return { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  }

  return (
    <div className="p-4 sm:p-6">
      {/* controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-ink">
          {MONTHS[cursor.m]} {cursor.y}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className={navBtn} aria-label="Previous month">←</button>
          <button
            onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}
            className="rounded-md border border-hair px-2.5 py-1 text-xs text-body hover:bg-canvas"
          >
            Today
          </button>
          <button onClick={() => shift(1)} className={navBtn} aria-label="Next month">→</button>
        </div>
        {dateCols.length > 1 && (
          <select
            value={dateColId}
            onChange={(e) => setDateColId(e.target.value)}
            className="ml-auto rounded-lg border border-hair bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal"
          >
            {dateCols.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* weekday header */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-xl border border-hair bg-hair">
        {DOW.map((d) => (
          <div key={d} className="bg-canvas px-2 py-1.5 text-center text-[11px] font-semibold text-muted">
            {d}
          </div>
        ))}
      </div>

      {/* days */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-xl border border-x border-b border-hair bg-hair">
        {days.map((d, i) => {
          const key = ymd(d);
          const inMonth = d.getMonth() === cursor.m;
          const items = byDate.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={i}
              className={`min-h-[92px] bg-white p-1.5 ${inMonth ? "" : "bg-canvas/40"}`}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${
                    isToday ? "bg-teal font-bold text-white" : inMonth ? "text-body" : "text-muted"
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {items.slice(0, 3).map((it) => (
                  <button
                    key={it.id}
                    onClick={() => open({ id: it.id, name: it.name })}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white"
                    style={{ background: itemColor(it) }}
                    title={it.name}
                  >
                    <span className="truncate">{it.name}</span>
                  </button>
                ))}
                {items.length > 3 && (
                  <span className="px-1 text-[10px] text-muted">+{items.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const navBtn =
  "grid h-7 w-7 place-items-center rounded-md border border-hair text-body hover:bg-canvas";
