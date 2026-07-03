"use client";

import { useState, useTransition } from "react";
import type { BoardData, ColumnData, GroupData, ItemData, PersonLite } from "@/lib/board-types";
import { COLUMN_TYPE_META, PALETTE, type StatusLabel } from "@/lib/constants";
import { Cell } from "./cells";
import { useBoardUI } from "./board-ui";
import {
  addItem,
  addGroup,
  renameItem,
  deleteItem,
  renameGroup,
  setGroupColor,
  deleteGroup,
  reorderItem,
  reorderGroup,
  renameColumn,
  deleteColumn,
  setColumnLabels,
  reorderColumn,
} from "@/app/actions/board";

const NAME_W = 300;
const COL_W = 168;

type ConnOpts = Record<string, { id: string; name: string }[]>;

export function TableView({
  board,
  people,
  readOnly,
  connectionOptions = {},
}: {
  board: BoardData;
  people: PersonLite[];
  readOnly: boolean;
  connectionOptions?: ConnOpts;
}) {
  return (
    <div className="min-w-max p-4 sm:p-6">
      {board.groups.map((g) => (
        <GroupBlock
          key={g.id}
          board={board}
          group={g}
          people={people}
          readOnly={readOnly}
          connectionOptions={connectionOptions}
        />
      ))}
      {!readOnly && <AddGroup boardId={board.id} />}
    </div>
  );
}

function GroupBlock({
  board,
  group,
  people,
  readOnly,
  connectionOptions,
}: {
  board: BoardData;
  group: GroupData;
  people: PersonLite[];
  readOnly: boolean;
  connectionOptions: ConnOpts;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(group.name);
  const [colorOpen, setColorOpen] = useState(false);
  const [, start] = useTransition();
  const rowWidth = NAME_W + board.columns.length * COL_W;

  return (
    <div className="mb-7 animate-rise">
      {/* Group title */}
      <div
        className="group mb-1.5 flex items-center gap-2"
        style={{ width: rowWidth }}
        onDragOver={(e) => {
          if (!readOnly) e.preventDefault();
        }}
        onDrop={(e) => {
          if (readOnly) return;
          const gid = e.dataTransfer.getData("text/group");
          if (gid && gid !== group.id) {
            e.preventDefault();
            start(() => void reorderGroup(board.id, gid, group.id));
          }
        }}
      >
        {!readOnly && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/group", group.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="hidden cursor-grab select-none text-muted active:cursor-grabbing group-hover:inline"
            title="Drag to reorder group"
          >
            ⠿
          </span>
        )}
        <div className="relative">
          <button
            disabled={readOnly}
            onClick={() => setColorOpen((o) => !o)}
            className="h-5 w-2 rounded-full"
            style={{ background: group.color }}
            title="Group color"
          />
          {colorOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setColorOpen(false)} />
              <div className="absolute z-30 mt-1 flex w-44 flex-wrap gap-1.5 rounded-xl border border-hair bg-white p-2 shadow-pop">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setColorOpen(false);
                      start(() => void setGroupColor(board.id, group.id, c));
                    }}
                    className="h-6 w-6 rounded-md ring-offset-1 hover:ring-2 hover:ring-ink/20"
                    style={{ background: c }}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {editingName ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditingName(false);
              start(() => void renameGroup(board.id, group.id, name));
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="rounded-md border border-hair px-1.5 py-0.5 text-base font-bold outline-none focus:border-teal"
            style={{ color: group.color }}
          />
        ) : (
          <button
            disabled={readOnly}
            onClick={() => setEditingName(true)}
            className="text-base font-bold tracking-tight"
            style={{ color: group.color }}
          >
            {group.name}
          </button>
        )}
        <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
          {group.items.length}
        </span>
        {!readOnly && (
          <button
            onClick={() => {
              if (confirm(`Delete group "${group.name}" and its items?`))
                start(() => void deleteGroup(board.id, group.id));
            }}
            className="ml-1 hidden text-xs text-muted hover:text-danger group-hover:inline"
            title="Delete group"
          >
            ✕
          </button>
        )}
      </div>

      {/* Card wrapper */}
      <div
        onDragOver={(e) => !readOnly && e.preventDefault()}
        onDrop={(e) => {
          if (readOnly) return;
          e.preventDefault();
          const draggedId = e.dataTransfer.getData("text/plain");
          if (draggedId) start(() => void reorderItem(board.id, draggedId, group.id, null));
        }}
        className="overflow-hidden rounded-xl border border-hair bg-white shadow-soft"
        style={{ width: rowWidth }}
      >
        {/* Column header */}
        <div className="flex items-stretch border-b border-hair bg-canvas/60">
          <div style={{ width: NAME_W }} className="flex items-center gap-1.5 px-3 py-2">
            <span className="h-full w-1.5 flex-none opacity-0" />
            <span className="text-xs font-semibold text-muted">Item</span>
          </div>
          {board.columns.map((c) => (
            <div key={c.id} style={{ width: COL_W }} className="border-l border-hair">
              <ColumnHeader boardId={board.id} column={c} readOnly={readOnly} />
            </div>
          ))}
        </div>

        {group.items.map((item) => (
          <Row
            key={item.id}
            board={board}
            group={group}
            item={item}
            people={people}
            readOnly={readOnly}
            connectionOptions={connectionOptions}
          />
        ))}

        {group.items.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted" style={{ paddingLeft: 18 }}>
            No items
          </p>
        )}

        {!readOnly && <AddItem boardId={board.id} groupId={group.id} color={group.color} />}
      </div>
    </div>
  );
}

function Row({
  board,
  group,
  item,
  people,
  readOnly,
  connectionOptions,
}: {
  board: BoardData;
  group: GroupData;
  item: ItemData;
  people: PersonLite[];
  readOnly: boolean;
  connectionOptions: ConnOpts;
}) {
  const [name, setName] = useState(item.name);
  const [over, setOver] = useState(false);
  const [, start] = useTransition();
  const { open } = useBoardUI();

  return (
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
        e.stopPropagation();
        setOver(false);
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId && draggedId !== item.id)
          start(() => void reorderItem(board.id, draggedId, group.id, item.id));
      }}
      className={`group flex items-stretch border-b border-hair last:border-b-0 hover:bg-canvas/50 ${
        over ? "border-t-2 border-t-teal" : ""
      }`}
    >
      <div className="flex items-center" style={{ width: NAME_W }}>
        <span className="h-full w-1.5 flex-none" style={{ background: group.color }} />
        {!readOnly && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", item.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="hidden w-4 flex-none cursor-grab select-none text-center text-muted active:cursor-grabbing group-hover:block"
            title="Drag to reorder"
          >
            ⠿
          </span>
        )}
        <input
          value={name}
          disabled={readOnly}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== item.name && start(() => void renameItem(board.id, item.id, name))}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="flex-1 bg-transparent px-2.5 py-2.5 text-sm font-medium text-ink outline-none focus:bg-teal/5"
        />
        <button
          onClick={() => open({ id: item.id, name: item.name })}
          className="mr-1 hidden h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-teal/10 hover:text-teal group-hover:grid"
          title="Open item"
        >
          ⤢
        </button>
        {!readOnly && (
          <button
            onClick={() => start(() => void deleteItem(board.id, item.id))}
            className="mr-1.5 hidden h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-danger/10 hover:text-danger group-hover:grid"
            title="Delete item"
          >
            ✕
          </button>
        )}
      </div>

      {board.columns.map((c) => (
        <div key={c.id} style={{ width: COL_W }} className="border-l border-hair">
          <Cell
            boardId={board.id}
            itemId={item.id}
            column={c}
            cell={item.cells[c.id]}
            people={people}
            readOnly={readOnly}
            options={connectionOptions[c.id]}
          />
        </div>
      ))}
    </div>
  );
}

function AddItem({ boardId, groupId, color }: { boardId: string; groupId: string; color: string }) {
  const [name, setName] = useState("");
  const [, start] = useTransition();
  function submit() {
    if (!name.trim()) return;
    start(() => void addItem(boardId, groupId, name));
    setName("");
  }
  return (
    <div className="flex items-center" style={{ width: NAME_W }}>
      <span className="h-full w-1.5 flex-none opacity-30" style={{ background: color }} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onBlur={submit}
        placeholder="+ Add item"
        className="flex-1 bg-transparent px-2.5 py-2.5 text-sm text-body outline-none placeholder:text-muted focus:bg-teal/5"
      />
    </div>
  );
}

function ColumnHeader({
  boardId,
  column,
  readOnly,
}: {
  boardId: string;
  column: ColumnData;
  readOnly: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [name, setName] = useState(column.name);
  const [, start] = useTransition();

  if (renaming) {
    return (
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          setRenaming(false);
          if (name.trim() && name !== column.name) start(() => void renameColumn(boardId, column.id, name));
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="w-full rounded border border-hair px-1.5 py-1 text-center text-xs font-semibold outline-none focus:border-teal"
      />
    );
  }

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        if (!readOnly) e.preventDefault();
      }}
      onDrop={(e) => {
        if (readOnly) return;
        const cid = e.dataTransfer.getData("text/column");
        if (cid && cid !== column.id) {
          e.preventDefault();
          start(() => void reorderColumn(boardId, cid, column.id));
        }
      }}
    >
      <button
        disabled={readOnly}
        draggable={!readOnly}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/column", column.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => setMenu((m) => !m)}
        className="flex w-full cursor-grab items-center justify-center gap-1 px-2 py-2 text-xs font-semibold text-muted hover:text-body active:cursor-grabbing"
      >
        <span className="font-mono text-[10px] text-muted/60">{COLUMN_TYPE_META[column.type]?.icon}</span>
        <span className="truncate">{column.name}</span>
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
          <div className="absolute left-1/2 top-8 z-30 w-40 -translate-x-1/2 rounded-lg border border-hair bg-white p-1 shadow-pop">
            <button onClick={() => { setMenu(false); setRenaming(true); }} className={menuItem}>
              Rename
            </button>
            {column.type === "status" && (
              <button onClick={() => { setMenu(false); setLabelsOpen(true); }} className={menuItem}>
                Edit labels
              </button>
            )}
            <button
              onClick={() => {
                setMenu(false);
                if (confirm(`Delete column "${column.name}"?`))
                  start(() => void deleteColumn(boardId, column.id));
              }}
              className={`${menuItem} text-danger`}
            >
              Delete
            </button>
          </div>
        </>
      )}
      {labelsOpen && (
        <LabelEditor
          boardId={boardId}
          columnId={column.id}
          initial={column.labels}
          onClose={() => setLabelsOpen(false)}
        />
      )}
    </div>
  );
}

const menuItem = "block w-full rounded px-2 py-1.5 text-left text-sm text-body hover:bg-canvas";

function LabelEditor({
  boardId,
  columnId,
  initial,
  onClose,
}: {
  boardId: string;
  columnId: string;
  initial: StatusLabel[];
  onClose: () => void;
}) {
  const [labels, setLabels] = useState<StatusLabel[]>(initial.length ? initial : []);
  const [, start] = useTransition();

  const update = (i: number, patch: Partial<StatusLabel>) =>
    setLabels((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <h2 className="text-lg font-bold text-ink">Edit status labels</h2>
        <div className="mt-3 flex flex-col gap-2">
          {labels.map((l, i) => (
            <div key={l.id} className="flex items-center gap-2">
              <input
                type="color"
                value={l.color}
                onChange={(e) => update(i, { color: e.target.value })}
                className="h-8 w-9 flex-none rounded border border-hair"
              />
              <input
                value={l.label}
                onChange={(e) => update(i, { label: e.target.value })}
                className="flex-1 rounded-md border border-hair px-2 py-1 text-sm outline-none focus:border-teal"
              />
              <button
                onClick={() => setLabels((ls) => ls.filter((_, idx) => idx !== i))}
                className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-danger/10 hover:text-danger"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            setLabels((ls) => [
              ...ls,
              { id: `l${Math.random().toString(36).slice(2, 8)}`, label: "New label", color: PALETTE[ls.length % PALETTE.length] },
            ])
          }
          className="mt-2 text-sm text-teal hover:underline"
        >
          + Add label
        </button>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">Cancel</button>
          <button
            onClick={() => {
              start(() => void setColumnLabels(boardId, columnId, labels));
              onClose();
            }}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep"
          >
            Save labels
          </button>
        </div>
      </div>
    </div>
  );
}

function AddGroup({ boardId }: { boardId: string }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [, start] = useTransition();
  if (!adding)
    return (
      <button
        onClick={() => setAdding(true)}
        className="rounded-lg border border-dashed border-hair px-3 py-2 text-sm text-muted transition hover:border-teal hover:text-teal"
      >
        + Add group
      </button>
    );
  return (
    <input
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => {
        if (name.trim()) start(() => void addGroup(boardId, name));
        setAdding(false);
        setName("");
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder="Group name"
      className="rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
    />
  );
}
