"use client";

import { useState, useTransition } from "react";
import type { BoardData, ItemData, PersonLite } from "@/lib/board-types";
import type { StatusLabel } from "@/lib/constants";
import { setCell } from "@/app/actions/board";
import { useBoardUI } from "./board-ui";

export function KanbanView({
  board,
  readOnly,
}: {
  board: BoardData;
  people: PersonLite[];
  readOnly: boolean;
}) {
  const statusCol = board.columns.find((c) => c.type === "status");
  if (!statusCol) {
    return (
      <div className="grid h-full place-items-center p-8 text-sm text-muted">
        Add a status column to use the Kanban view.
      </div>
    );
  }

  const allItems = board.groups.flatMap((g) => g.items);
  const lanes: { label: StatusLabel | null; items: ItemData[] }[] = [
    ...statusCol.labels.map((label) => ({
      label,
      items: allItems.filter((it) => it.cells[statusCol.id]?.value === label.id),
    })),
    {
      label: null,
      items: allItems.filter((it) => {
        const v = it.cells[statusCol.id]?.value;
        return !v || !statusCol.labels.some((l) => l.id === v);
      }),
    },
  ];

  return (
    <div className="flex gap-4 p-4 sm:p-6">
      {lanes.map((lane, i) => (
        <Lane
          key={lane.label?.id ?? "none"}
          board={board}
          statusColId={statusCol.id}
          labels={statusCol.labels}
          label={lane.label}
          items={lane.items}
          readOnly={readOnly}
          delay={i}
        />
      ))}
    </div>
  );
}

function Lane({
  board,
  statusColId,
  labels,
  label,
  items,
  readOnly,
  delay,
}: {
  board: BoardData;
  statusColId: string;
  labels: StatusLabel[];
  label: StatusLabel | null;
  items: ItemData[];
  readOnly: boolean;
  delay: number;
}) {
  const color = label?.color ?? "#9AA4B2";
  const targetValue = label?.id ?? null;
  const [over, setOver] = useState(false);
  const [, start] = useTransition();
  return (
    <div className="flex w-72 flex-none flex-col animate-rise" style={{ animationDelay: `${delay * 40}ms` }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <h3 className="text-sm font-bold" style={{ color }}>
          {label?.label ?? "No status"}
        </h3>
        <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
          {items.length}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (readOnly) return;
          e.preventDefault();
          setOver(false);
          const id = e.dataTransfer.getData("text/plain");
          if (id) start(() => void setCell(board.id, id, statusColId, targetValue));
        }}
        className="flex flex-col gap-2 rounded-xl p-2 transition"
        style={{
          background: `${color}0f`,
          minHeight: 80,
          boxShadow: over ? `inset 0 0 0 2px ${color}` : undefined,
        }}
      >
        {items.map((item) => (
          <Card
            key={item.id}
            board={board}
            item={item}
            statusColId={statusColId}
            labels={labels}
            readOnly={readOnly}
          />
        ))}
        {items.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted">Empty</p>
        )}
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("");
}

function Card({
  board,
  item,
  statusColId,
  labels,
  readOnly,
}: {
  board: BoardData;
  item: ItemData;
  statusColId: string;
  labels: StatusLabel[];
  readOnly: boolean;
}) {
  const [, start] = useTransition();
  const { open } = useBoardUI();

  // Chips: other status columns; avatars: person columns.
  const chips = board.columns
    .filter((c) => c.type === "status" && c.id !== statusColId)
    .map((c) => {
      const v = item.cells[c.id]?.value;
      const l = c.labels.find((x) => x.id === v);
      return l ? { key: c.id, label: l.label, color: l.color } : null;
    })
    .filter(Boolean) as { key: string; label: string; color: string }[];

  const people = board.columns
    .filter((c) => c.type === "person")
    .map((c) => item.cells[c.id]?.person)
    .filter(Boolean);

  return (
    <div
      draggable={!readOnly}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`rounded-lg border border-hair bg-white p-3 shadow-soft transition hover:shadow-pop ${
        readOnly ? "" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      <button
        onClick={() => open({ id: item.id, name: item.name })}
        className="text-left text-sm font-semibold text-ink hover:text-teal"
      >
        {item.name}
      </button>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {chips.map((ch) => (
            <span
              key={ch.key}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ background: ch.color }}
            >
              {ch.label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {people.map((p) => (
            <span
              key={p!.id}
              title={p!.name}
              className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white ring-2 ring-white"
              style={{ background: p!.avatarColor }}
            >
              {initials(p!.name)}
            </span>
          ))}
        </div>

        {!readOnly && (
          <select
            value={item.cells[statusColId]?.value ?? ""}
            onChange={(e) =>
              start(() => void setCell(board.id, item.id, statusColId, e.target.value || null))
            }
            className="rounded-md border border-hair bg-white px-1.5 py-1 text-xs text-muted outline-none focus:border-teal"
            title="Move to…"
          >
            <option value="">move…</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
