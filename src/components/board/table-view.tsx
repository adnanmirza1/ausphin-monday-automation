"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { DropdownMenu, useDismissableMenu, DRAG_OVER_CLASS, DRAGGING_CLASS } from "@/components/ui/popover";
import type {
  BoardData,
  ColumnData,
  GroupData,
  ItemData,
  SubitemData,
  PersonLite,
  PermData,
  CustomEdit,
} from "@/lib/board-types";
import {
  COLUMN_TYPE_META,
  COLUMN_TYPES,
  PALETTE,
  type ColumnType,
  type StatusLabel,
} from "@/lib/constants";
import { Cell } from "./cells";
import { useBoardUI } from "./board-ui";
import {
  addItem,
  addGroup,
  renameItem,
  deleteItem,
  addSubitem,
  reorderSubitem,
  renameGroup,
  setGroupColor,
  deleteGroup,
  reorderItem,
  reorderGroup,
  moveGroup,
  renameColumn,
  deleteColumn,
  setColumnLabels,
  reorderColumn,
  duplicateColumn,
  addColumn,
  setColumnDescription,
  setColumnRequired,
  setColumnDefault,
  sortItemsByColumn,
  bulkDeleteItems,
  bulkMoveItems,
  setColumnPermission,
  setItemColumnName,
} from "@/app/actions/board";

// ── Bulk selection (shared across all groups of the board) ──
type SelCtx = {
  selected: Set<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
  clear: () => void;
  enabled: boolean;
};
const SelectionContext = createContext<SelCtx | null>(null);
const useSel = () => useContext(SelectionContext);

const NAME_W = 300;
const COL_W = 168;

type ConnOpts = Record<string, { id: string; name: string }[]>;

export type RowHeight = "compact" | "default" | "tall";

const ROW_PAD: Record<RowHeight, string> = {
  compact: "py-1",
  default: "py-2.5",
  tall: "py-4",
};

// Tint a row background from a status label colour (6-digit hex) at ~11% alpha.
function tintFor(board: BoardData, item: ItemData, colorBy: string | null) {
  if (!colorBy) return undefined;
  const col = board.columns.find((c) => c.id === colorBy && c.type === "status");
  if (!col) return undefined;
  const value = item.cells[colorBy]?.value;
  const color = col.labels.find((l) => l.id === value)?.color;
  return color ? `${color}1F` : undefined;
}

export function TableView({
  board,
  people,
  permData,
  readOnly,
  connectionOptions = {},
  rowHeight = "default",
  colorBy = null,
  pinFirst = false,
}: {
  board: BoardData;
  people: PersonLite[];
  permData: PermData;
  readOnly: boolean;
  connectionOptions?: ConnOpts;
  rowHeight?: RowHeight;
  colorBy?: string | null;
  pinFirst?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const setMany = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });
  const clear = () => setSelected(new Set());
  const sel: SelCtx = { selected, toggle, setMany, clear, enabled: !readOnly };

  return (
    <SelectionContext.Provider value={sel}>
      <div className="min-w-max p-4 sm:p-6">
        {board.groups.map((g, i) => (
          <GroupBlock
            key={g.id}
            board={board}
            group={g}
            isFirst={i === 0}
            isLast={i === board.groups.length - 1}
            people={people}
            permData={permData}
            readOnly={readOnly}
            connectionOptions={connectionOptions}
            rowHeight={rowHeight}
            colorBy={colorBy}
            pinFirst={pinFirst}
          />
        ))}
        {!readOnly && <AddGroup boardId={board.id} />}
      </div>
      {selected.size > 0 && <BulkBar board={board} selected={selected} clear={clear} />}
    </SelectionContext.Provider>
  );
}

// Floating action bar shown while items are selected.
function BulkBar({
  board,
  selected,
  clear,
}: {
  board: BoardData;
  selected: Set<string>;
  clear: () => void;
}) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [pending, start] = useTransition();
  const ids = [...selected];

  return createPortal(
    <div className="fixed bottom-6 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-hair bg-white px-3 py-2 shadow-pop">
      <span className="px-1 text-sm font-semibold text-ink">{ids.length} selected</span>
      <span className="mx-1 h-5 w-px bg-hair" />

      <DropdownMenu
        open={moveOpen}
        onOpenChange={setMoveOpen}
        width={176}
        trigger={(p) => (
          <button
            ref={p.ref}
            onClick={p.onClick}
            disabled={pending}
            aria-expanded={p["aria-expanded"]}
            aria-haspopup={p["aria-haspopup"]}
            className="rounded-lg px-3 py-1.5 text-sm text-body hover:bg-canvas disabled:opacity-60 disabled:cursor-wait"
          >
            {pending ? "Working…" : "⇄ Move to"}
          </button>
        )}
        panelClassName="rounded-lg border border-hair bg-white p-1 shadow-pop overflow-y-auto scroll-thin"
      >
        {board.groups.map((g) => (
          <button
            key={g.id}
            onClick={() => {
              setMoveOpen(false);
              start(async () => {
                await bulkMoveItems(board.id, ids, g.id);
                clear();
              });
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-body hover:bg-canvas"
          >
            <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: g.color }} />
            {g.name}
          </button>
        ))}
      </DropdownMenu>

      <button
        onClick={() => {
          if (confirm(`Delete ${ids.length} item${ids.length === 1 ? "" : "s"}? This can't be undone.`))
            start(async () => {
              await bulkDeleteItems(board.id, ids);
              clear();
            });
        }}
        disabled={pending}
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60 disabled:cursor-wait"
      >
        {pending ? "Deleting…" : "🗑 Delete"}
      </button>

      <span className="mx-1 h-5 w-px bg-hair" />
      <button
        onClick={clear}
        disabled={pending}
        className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-canvas disabled:opacity-60"
      >
        Clear
      </button>
    </div>,
    document.body
  );
}

// Sticky classes for the pinned Item column (header + rows).
const PIN_CLS = "sticky left-0 z-10";

function GroupBlock({
  board,
  group,
  isFirst,
  isLast,
  people,
  permData,
  readOnly,
  connectionOptions,
  rowHeight,
  colorBy,
  pinFirst,
}: {
  board: BoardData;
  group: GroupData;
  isFirst: boolean;
  isLast: boolean;
  people: PersonLite[];
  permData: PermData;
  readOnly: boolean;
  connectionOptions: ConnOpts;
  rowHeight: RowHeight;
  colorBy: string | null;
  pinFirst: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(group.name);
  const [colorOpen, setColorOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const sel = useSel();
  const rowWidth = NAME_W + board.columns.length * COL_W;
  const allSel = group.items.length > 0 && group.items.every((it) => sel?.selected.has(it.id));
  const someSel = group.items.some((it) => sel?.selected.has(it.id));
  const [collapsed, setCollapsed] = useGroupCollapsed(board.id, group.id);

  return (
    <div className="mb-7 animate-rise">
      {/* Group title */}
      <div
        className={`group mb-1.5 flex items-center gap-2 border-t-2 ${
          dragOver ? "border-t-teal" : "border-t-transparent"
        } ${dragging ? DRAGGING_CLASS : ""}`}
        style={{ width: rowWidth }}
        onDragOver={(e) => {
          if (!readOnly) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (readOnly) return;
          setDragOver(false);
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
              setDragging(true);
            }}
            onDragEnd={() => setDragging(false)}
            className="hidden cursor-grab select-none text-muted active:cursor-grabbing group-hover:inline"
            title="Drag to reorder group"
          >
            ⠿
          </span>
        )}
        {!readOnly && (
          <span className="hidden flex-col leading-none group-hover:flex">
            <button
              onClick={() => start(() => void moveGroup(board.id, group.id, "up"))}
              disabled={isFirst}
              className="text-[9px] text-muted hover:text-teal disabled:opacity-30 disabled:hover:text-muted"
              title="Move group up"
              aria-label="Move group up"
            >
              ▲
            </button>
            <button
              onClick={() => start(() => void moveGroup(board.id, group.id, "down"))}
              disabled={isLast}
              className="text-[9px] text-muted hover:text-teal disabled:opacity-30 disabled:hover:text-muted"
              title="Move group down"
              aria-label="Move group down"
            >
              ▼
            </button>
          </span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="grid h-4 w-4 flex-none place-items-center text-[10px] text-muted hover:text-teal"
          title={collapsed ? "Expand group" : "Collapse group"}
          aria-label={collapsed ? "Expand group" : "Collapse group"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <DropdownMenu
          open={colorOpen}
          onOpenChange={setColorOpen}
          width={176}
          trigger={(p) => (
            <button
              ref={p.ref}
              disabled={readOnly}
              onClick={p.onClick}
              aria-expanded={p["aria-expanded"]}
              aria-haspopup={p["aria-haspopup"]}
              className="h-5 w-2 rounded-full"
              style={{ background: group.color }}
              title="Group color"
            />
          )}
          panelClassName="flex flex-wrap gap-1.5 rounded-xl border border-hair bg-white p-2 shadow-pop"
        >
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
        </DropdownMenu>

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
            disabled={pending}
            className={`ml-1 text-xs text-muted hover:text-danger disabled:opacity-60 disabled:cursor-wait ${
              pending ? "inline" : "hidden group-hover:inline"
            }`}
            title="Delete group"
          >
            {pending ? "…" : "✕"}
          </button>
        )}
      </div>

      {/* Card wrapper */}
      {!collapsed && (
        <div
          onDragOver={(e) => !readOnly && e.preventDefault()}
          onDrop={(e) => {
            if (readOnly) return;
            e.preventDefault();
            const draggedId = e.dataTransfer.getData("text/plain");
            if (draggedId) start(() => void reorderItem(board.id, draggedId, group.id, null));
          }}
          className={`rounded-xl border border-hair bg-white shadow-soft ${pinFirst ? "" : "overflow-hidden"}`}
          style={{ width: rowWidth }}
        >
          {/* Column header */}
          <div className="flex items-stretch border-b border-hair bg-canvas/60">
            <div
              style={{ width: NAME_W }}
              className={`flex items-center gap-1.5 px-3 py-2 ${pinFirst ? `${PIN_CLS} z-20 bg-canvas` : ""}`}
            >
              {!readOnly && sel && group.items.length > 0 && (
                <input
                  type="checkbox"
                  checked={allSel}
                  ref={(el) => {
                    if (el) el.indeterminate = someSel && !allSel;
                  }}
                  onChange={(e) => sel.setMany(group.items.map((it) => it.id), e.target.checked)}
                  className="h-3.5 w-3.5 flex-none cursor-pointer accent-teal"
                  title="Select all in this group"
                />
              )}
              <span className="h-full w-1.5 flex-none opacity-0" />
              <ItemColumnLabel boardId={board.id} name={board.itemColumnName} readOnly={readOnly} />
            </div>
            {board.columns.map((c) => (
              <div key={c.id} style={{ width: COL_W }} className="border-l border-hair">
                <ColumnHeader boardId={board.id} column={c} permData={permData} readOnly={readOnly} />
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
              rowHeight={rowHeight}
              colorBy={colorBy}
              pinFirst={pinFirst}
            />
          ))}

          {group.items.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted" style={{ paddingLeft: 18 }}>
              No items
            </p>
          )}

          {!readOnly && <AddItem boardId={board.id} groupId={group.id} color={group.color} />}
        </div>
      )}
    </div>
  );
}

// Per-group collapsed/expanded state, persisted in localStorage per board so
// a fold survives page refresh without needing a schema migration for what
// is purely a local view preference (matches how Monday.com treats group
// collapse — per viewer, not shared data).
function collapsedKey(boardId: string) {
  return `docugen:collapsedGroups:${boardId}`;
}

function readCollapsedSet(boardId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(collapsedKey(boardId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function useGroupCollapsed(boardId: string, groupId: string): [boolean, (fn: (c: boolean) => boolean) => void] {
  const [collapsed, setCollapsedState] = useState(() => readCollapsedSet(boardId).has(groupId));

  const setCollapsed = (fn: (c: boolean) => boolean) => {
    setCollapsedState((prev) => {
      const next = fn(prev);
      const set = readCollapsedSet(boardId);
      if (next) set.add(groupId);
      else set.delete(groupId);
      try {
        window.localStorage.setItem(collapsedKey(boardId), JSON.stringify([...set]));
      } catch {
        // localStorage unavailable (private mode / quota) — collapse still
        // works for this session, just won't survive a refresh.
      }
      return next;
    });
  };

  return [collapsed, setCollapsed];
}

// Click-to-rename label for the built-in Item column (Improvement 3). Empty
// input resets to the default "Item" — never blocks on an empty name since
// the underlying field is optional (falls back to "Item" everywhere).
function ItemColumnLabel({
  boardId,
  name,
  readOnly,
}: {
  boardId: string;
  name: string;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name || "Item");
  const [, start] = useTransition();

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          setEditing(false);
          const next = value.trim();
          if (next !== (name || "Item")) start(() => void setItemColumnName(boardId, next === "Item" ? "" : next));
          if (!next) setValue("Item");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValue(name || "Item");
            setEditing(false);
          }
        }}
        maxLength={60}
        className="w-full rounded border border-hair px-1 py-0.5 text-xs font-semibold text-ink outline-none focus:border-teal"
      />
    );
  }

  return (
    <button
      disabled={readOnly}
      onClick={() => {
        setValue(name || "Item");
        setEditing(true);
      }}
      title={readOnly ? undefined : "Rename this column (e.g. Candidate Name)"}
      className="truncate text-xs font-semibold text-muted hover:text-teal-deep disabled:hover:text-muted"
    >
      {name || "Item"}
    </button>
  );
}

function Row({
  board,
  group,
  item,
  people,
  readOnly,
  connectionOptions,
  rowHeight,
  colorBy,
  pinFirst,
}: {
  board: BoardData;
  group: GroupData;
  item: ItemData;
  people: PersonLite[];
  readOnly: boolean;
  connectionOptions: ConnOpts;
  rowHeight: RowHeight;
  colorBy: string | null;
  pinFirst: boolean;
}) {
  const [name, setName] = useState(item.name);
  const [over, setOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const { open } = useBoardUI();
  const sel = useSel();
  const tint = tintFor(board, item, colorBy);
  const isSel = sel?.selected.has(item.id) ?? false;
  const hasSubitems = item.subitems.length > 0;
  const [expanded, setExpanded] = useState(hasSubitems);

  return (
    <>
    <div
      onDragOver={(e) => {
        if (readOnly) return;
        if (!e.dataTransfer.types.includes("text/plain")) return; // ignore subitem drags
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (readOnly) return;
        const draggedId = e.dataTransfer.getData("text/plain");
        if (!draggedId) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        if (draggedId !== item.id)
          start(() => void reorderItem(board.id, draggedId, group.id, item.id));
      }}
      style={tint ? { background: tint } : undefined}
      className={`group flex items-stretch border-b border-hair last:border-b-0 ${
        tint ? "" : "hover:bg-canvas/50"
      } ${over ? DRAG_OVER_CLASS : ""} ${dragging ? DRAGGING_CLASS : ""}`}
    >
      <div
        className={`flex items-center ${pinFirst ? PIN_CLS : ""}`}
        style={{ width: NAME_W, background: pinFirst ? tint ?? "#ffffff" : undefined }}
      >
        <span className="h-full w-1.5 flex-none" style={{ background: group.color }} />
        {!readOnly && sel && (
          <input
            type="checkbox"
            checked={isSel}
            onChange={() => sel.toggle(item.id)}
            className={`ml-1.5 h-3.5 w-3.5 flex-none cursor-pointer accent-teal ${
              isSel ? "" : "opacity-0 group-hover:opacity-100"
            }`}
            title="Select item"
          />
        )}
        {!readOnly && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", item.id);
              e.dataTransfer.effectAllowed = "move";
              setDragging(true);
            }}
            onDragEnd={() => setDragging(false)}
            className="hidden w-4 flex-none cursor-grab select-none text-center text-muted active:cursor-grabbing group-hover:block"
            title="Drag to reorder"
          >
            ⠿
          </span>
        )}
        {!readOnly || hasSubitems ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            className={`grid h-4 w-4 flex-none place-items-center text-[10px] text-muted hover:text-teal ${
              hasSubitems ? "" : "opacity-0 group-hover:opacity-100"
            }`}
            title={expanded ? "Collapse subitems" : hasSubitems ? "Expand subitems" : "Add subitem"}
            aria-label={expanded ? "Collapse subitems" : hasSubitems ? "Expand subitems" : "Add subitem"}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 flex-none" />
        )}
        <input
          value={name}
          disabled={readOnly}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== item.name && start(() => void renameItem(board.id, item.id, name))}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={`min-w-0 flex-1 bg-transparent px-2.5 text-sm font-medium text-ink outline-none focus:bg-teal/5 ${ROW_PAD[rowHeight]}`}
        />
        {hasSubitems && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex-none rounded-full bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-muted hover:text-teal"
            title={`${item.subitems.length} subitem${item.subitems.length === 1 ? "" : "s"}`}
          >
            {item.subitems.length}
          </button>
        )}
        {/* Row actions — reserved space (no reflow) + solid bg so they never
            overlap the item name or spill into the next column. */}
        <div
          className="flex flex-none items-center gap-0.5 pr-1.5 pl-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
          style={{ background: pinFirst ? tint ?? "#ffffff" : undefined }}
        >
          <button
            onClick={() => open({ id: item.id, name: item.name })}
            className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-teal/10 hover:text-teal"
            title="Open item"
            aria-label="Open item"
          >
            ⤢
          </button>
          {!readOnly && (
            <button
              onClick={() => {
                if (confirm(`Delete "${item.name}"? This can't be undone.`))
                  start(() => void deleteItem(board.id, item.id));
              }}
              disabled={pending}
              className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-60 disabled:cursor-wait"
              title="Delete item"
              aria-label="Delete item"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {board.columns.map((c) => (
        <div key={c.id} style={{ width: COL_W }} className="border-l border-hair">
          <Cell
            boardId={board.id}
            itemId={item.id}
            column={c}
            cell={item.cells[c.id]}
            people={people}
            readOnly={readOnly || c.editable === false}
            options={connectionOptions[c.id]}
          />
        </div>
      ))}
    </div>
    {expanded && (
      <>
        {item.subitems.map((sub) => (
          <SubitemRow
            key={sub.id}
            board={board}
            group={group}
            parentId={item.id}
            subitem={sub}
            people={people}
            readOnly={readOnly}
            connectionOptions={connectionOptions}
          />
        ))}
        {!readOnly && <AddSubitem boardId={board.id} parentId={item.id} />}
      </>
    )}
    </>
  );
}

// A subitem row: visually indented, same cell-editing machinery as a main
// row. Drag-reorder is scoped to siblings under the same parent only —
// subitems never change parent or group via drag (matches monday.com); its
// own expand toggle isn't needed (subitems don't nest further).
function SubitemRow({
  board,
  group,
  parentId,
  subitem,
  people,
  readOnly,
  connectionOptions,
}: {
  board: BoardData;
  group: GroupData;
  parentId: string;
  subitem: SubitemData;
  people: PersonLite[];
  readOnly: boolean;
  connectionOptions: ConnOpts;
}) {
  const [name, setName] = useState(subitem.name);
  const [over, setOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const { open } = useBoardUI();

  return (
    <div
      onDragOver={(e) => {
        if (readOnly) return;
        if (!e.dataTransfer.types.includes("text/subitem")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (readOnly) return;
        const draggedId = e.dataTransfer.getData("text/subitem");
        if (!draggedId) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        if (draggedId !== subitem.id)
          start(() => void reorderSubitem(board.id, parentId, draggedId, subitem.id));
      }}
      className={`group flex items-stretch border-b border-hair bg-canvas/30 last:border-b-0 ${
        over ? DRAG_OVER_CLASS : ""
      } ${dragging ? DRAGGING_CLASS : ""}`}
    >
      <div className="flex items-center" style={{ width: NAME_W }}>
        <span className="h-full w-1.5 flex-none opacity-40" style={{ background: group.color }} />
        {!readOnly && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/subitem", subitem.id);
              e.dataTransfer.effectAllowed = "move";
              setDragging(true);
            }}
            onDragEnd={() => setDragging(false)}
            className="hidden w-3 flex-none cursor-grab select-none text-center text-[10px] text-muted active:cursor-grabbing group-hover:block"
            title="Drag to reorder"
          >
            ⠿
          </span>
        )}
        <span className="ml-1 flex-none text-muted/70" title="Subitem">↳</span>
        <input
          value={name}
          disabled={readOnly}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== subitem.name && start(() => void renameItem(board.id, subitem.id, name))}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-body outline-none focus:bg-teal/5"
        />
        <div className="flex flex-none items-center gap-0.5 pr-1.5 pl-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            onClick={() => open({ id: subitem.id, name: subitem.name })}
            className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-teal/10 hover:text-teal"
            title="Open subitem"
            aria-label="Open subitem"
          >
            ⤢
          </button>
          {!readOnly && (
            <button
              onClick={() => {
                if (confirm(`Delete "${subitem.name}"? This can't be undone.`))
                  start(() => void deleteItem(board.id, subitem.id));
              }}
              disabled={pending}
              className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-60 disabled:cursor-wait"
              title="Delete subitem"
              aria-label="Delete subitem"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {board.columns.map((c) => (
        <div key={c.id} style={{ width: COL_W }} className="border-l border-hair">
          <Cell
            boardId={board.id}
            itemId={subitem.id}
            column={c}
            cell={subitem.cells[c.id]}
            people={people}
            readOnly={readOnly || c.editable === false}
            options={connectionOptions[c.id]}
          />
        </div>
      ))}
    </div>
  );
}

function AddSubitem({ boardId, parentId }: { boardId: string; parentId: string }) {
  const [name, setName] = useState("");
  const [over, setOver] = useState(false);
  const [, start] = useTransition();
  function submit() {
    if (!name.trim()) return;
    start(() => void addSubitem(boardId, parentId, name));
    setName("");
  }
  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("text/subitem")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const draggedId = e.dataTransfer.getData("text/subitem");
        if (!draggedId) return;
        e.preventDefault();
        setOver(false);
        // Dropping past the last row places it at the end of this parent's list.
        start(() => void reorderSubitem(boardId, parentId, draggedId, null));
      }}
      className={`flex items-center bg-canvas/30 ${over ? DRAG_OVER_CLASS : ""}`}
      style={{ width: NAME_W }}
    >
      <span className="h-full w-1.5 flex-none opacity-0" />
      <span className="ml-3 flex-none text-muted/40">↳</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onBlur={submit}
        placeholder="+ Add subitem"
        className="flex-1 bg-transparent px-2 py-2 text-sm text-body outline-none placeholder:text-muted focus:bg-teal/5"
      />
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

// Column types offered by "Add column to the right" — connection/mirror need
// the full wiring flow (targetBoard / source column), so they're excluded here.
const ADD_RIGHT_TYPES = COLUMN_TYPES.filter(
  (t) => t !== "connection" && t !== "mirror"
);

function ColumnHeader({
  boardId,
  column,
  permData,
  readOnly,
}: {
  boardId: string;
  column: ColumnData;
  permData: PermData;
  readOnly: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [sub, setSub] = useState<"main" | "addRight" | "custom">("main");
  const [renaming, setRenaming] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [name, setName] = useState(column.name);
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { triggerRef: menuBtnRef, panelRef, pos: menuPos, close: closeMenuBase } = useDismissableMenu<HTMLButtonElement>({
    open: menu,
    onClose: () => setMenu(false),
    width: 208,
    maxHeight: 420,
  });
  const [pending, start] = useTransition();

  function openMenu() {
    setSub("main");
    setMenu(true);
  }
  function closeMenu() {
    closeMenuBase();
    setSub("main");
  }
  const act = (fn: () => void) => {
    closeMenu();
    fn();
  };

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
      className={`group relative border-t-2 ${dragOver ? DRAG_OVER_CLASS : "border-t-transparent"} ${
        dragging ? DRAGGING_CLASS : ""
      }`}
      onDragOver={(e) => {
        if (!readOnly) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (readOnly) return;
        setDragOver(false);
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
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        title={column.description || "Drag to reorder"}
        className="flex w-full cursor-grab items-center justify-center gap-1 px-2 py-2 pr-5 text-xs font-semibold text-muted hover:text-body active:cursor-grabbing"
      >
        <span className="font-mono text-[10px] text-muted/60">{COLUMN_TYPE_META[column.type]?.icon}</span>
        <span className="truncate">{column.name}</span>
        {column.required && <span className="text-danger" title="Required">*</span>}
        {column.editPolicy && column.editPolicy !== "all" && (
          <span className="text-muted/70" title="Editing restricted">🔒</span>
        )}
        {column.description && <span className="text-muted/60" title={column.description}>ⓘ</span>}
      </button>
      {/* Separate, non-draggable menu trigger — the drag handle above covers
          the full header, so this dedicated button (not just a decorative
          span) is what actually opens the "⋮" menu. Keeps a slow/deliberate
          click from ever being misread as a drag. */}
      {!readOnly && (
        <button
          ref={menuBtnRef}
          type="button"
          draggable={false}
          disabled={pending}
          onDragStart={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            if (menu) closeMenu();
            else openMenu();
          }}
          aria-expanded={menu}
          aria-haspopup="menu"
          title="Column options"
          className={`absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-sm leading-none text-muted transition-opacity hover:bg-canvas hover:text-body disabled:cursor-wait disabled:opacity-60 ${
            menu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          ⋮
        </button>
      )}
      {menu && menuPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onMouseDown={closeMenu} />
            <div
              ref={panelRef}
              className="fixed z-50 w-52 rounded-lg border border-hair bg-white p-1 shadow-pop overflow-y-auto scroll-thin"
              style={{ top: menuPos.top, left: menuPos.left, maxHeight: menuPos.maxHeight }}
            >
              {sub === "main" ? (
                <>
                  <button onClick={() => act(() => setRenaming(true))} className={menuItem}>
                    ✎ Rename
                  </button>
                  <button onClick={() => act(() => setDescOpen(true))} className={menuItem}>
                    ≣ Edit description
                  </button>
                  {column.type === "status" && (
                    <button onClick={() => act(() => setLabelsOpen(true))} className={menuItem}>
                      ◉ Edit labels
                    </button>
                  )}

                  <Divider />
                  <button
                    onClick={() => act(() => start(() => void sortItemsByColumn(boardId, column.id, "asc")))}
                    className={menuItem}
                  >
                    ↑ Sort ascending
                  </button>
                  <button
                    onClick={() => act(() => start(() => void sortItemsByColumn(boardId, column.id, "desc")))}
                    className={menuItem}
                  >
                    ↓ Sort descending
                  </button>

                  <Divider />
                  <button
                    onClick={() => act(() => start(() => void duplicateColumn(boardId, column.id)))}
                    className={menuItem}
                  >
                    ⧉ Duplicate column
                  </button>
                  <button onClick={() => setSub("addRight")} className={`${menuItem} flex items-center justify-between`}>
                    <span>＋ Add column to the right</span>
                    <span className="text-muted">›</span>
                  </button>

                  <Divider />
                  <button
                    onClick={() =>
                      act(() => start(() => void setColumnRequired(boardId, column.id, !column.required)))
                    }
                    className={menuItem}
                  >
                    {column.required ? "○ Unset required" : "◎ Set as required"}
                  </button>
                  <button onClick={() => act(() => setDefaultOpen(true))} className={menuItem}>
                    ◆ Default value{column.defaultValue ? " ✓" : ""}
                  </button>

                  <Divider />
                  <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted/70">
                    Who can edit
                  </p>
                  <button
                    onClick={() => act(() => start(() => void setColumnPermission(boardId, column.id, "all")))}
                    className={`${menuItem} flex items-center justify-between`}
                  >
                    <span>🔓 Anyone</span>
                    {(!column.editPolicy || column.editPolicy === "all") && <span className="text-teal">✓</span>}
                  </button>
                  <button
                    onClick={() => act(() => start(() => void setColumnPermission(boardId, column.id, "admins")))}
                    className={`${menuItem} flex items-center justify-between`}
                  >
                    <span>🔒 Admins only</span>
                    {column.editPolicy === "admins" && <span className="text-teal">✓</span>}
                  </button>
                  <button
                    onClick={() => setSub("custom")}
                    className={`${menuItem} flex items-center justify-between`}
                  >
                    <span>👥 Custom…</span>
                    {!!column.editPolicy &&
                      column.editPolicy !== "all" &&
                      column.editPolicy !== "admins" && <span className="text-teal">✓</span>}
                  </button>

                  <Divider />
                  <button
                    onClick={() =>
                      act(() => {
                        if (confirm(`Delete column "${column.name}"?`))
                          start(() => void deleteColumn(boardId, column.id));
                      })
                    }
                    className={`${menuItem} text-danger`}
                  >
                    🗑 Delete
                  </button>
                </>
              ) : sub === "addRight" ? (
                <>
                  <button
                    onClick={() => setSub("main")}
                    className={`${menuItem} flex items-center gap-1 text-muted`}
                  >
                    ‹ Add to the right
                  </button>
                  <Divider />
                  <div className="grid grid-cols-3 gap-1 p-1">
                    {ADD_RIGHT_TYPES.map((t) => (
                      <button
                        key={t}
                        onClick={() =>
                          act(() =>
                            start(() =>
                              void addColumn(
                                boardId,
                                COLUMN_TYPE_META[t as ColumnType].label,
                                t as ColumnType,
                                undefined,
                                column.id
                              )
                            )
                          )
                        }
                        className="flex flex-col items-center gap-0.5 rounded-lg border border-hair px-1 py-1.5 text-[10px] text-muted hover:border-teal/50 hover:text-teal"
                      >
                        <span className="font-mono text-sm">{COLUMN_TYPE_META[t as ColumnType].icon}</span>
                        {COLUMN_TYPE_META[t as ColumnType].label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <CustomPermPanel
                  boardId={boardId}
                  column={column}
                  permData={permData}
                  onBack={() => setSub("main")}
                  onSaved={closeMenu}
                />
              )}
            </div>
          </>,
          document.body
        )}
      {labelsOpen && (
        <LabelEditor
          boardId={boardId}
          columnId={column.id}
          initial={column.labels}
          onClose={() => setLabelsOpen(false)}
        />
      )}
      {descOpen && (
        <DescriptionEditor
          boardId={boardId}
          columnId={column.id}
          columnName={column.name}
          initial={column.description ?? ""}
          onClose={() => setDescOpen(false)}
        />
      )}
      {defaultOpen && (
        <DefaultValueEditor column={column} boardId={boardId} onClose={() => setDefaultOpen(false)} />
      )}
    </div>
  );
}

// "Custom" column-edit permission (Improvement #1) — pick any roles /
// departments / users who may edit this column's cells (admins always may).
function CustomPermPanel({
  boardId,
  column,
  permData,
  onBack,
  onSaved,
}: {
  boardId: string;
  column: ColumnData;
  permData: PermData;
  onBack: () => void;
  onSaved: () => void;
}) {
  const initial: CustomEdit = (() => {
    const p = column.editPolicy;
    if (Array.isArray(p)) return { roles: p, departments: [], users: [] }; // legacy
    if (p && typeof p === "object")
      return {
        roles: p.roles ?? [],
        departments: p.departments ?? [],
        users: p.users ?? [],
      };
    return { roles: [], departments: [], users: [] };
  })();

  const [roles, setRoles] = useState<string[]>(initial.roles);
  const [departments, setDepartments] = useState<string[]>(initial.departments);
  const [users, setUsers] = useState<string[]>(initial.users);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();

  const toggle = (
    id: string,
    list: string[],
    setter: (v: string[]) => void
  ) => setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function save() {
    start(() =>
      void setColumnPermission(boardId, column.id, { roles, departments, users })
    );
    onSaved();
  }

  const total = roles.length + departments.length + users.length;

  // Type-to-find across roles / teams / people (Improvement #1).
  const needle = q.trim().toLowerCase();
  const match = (name: string) => !needle || name.toLowerCase().includes(needle);
  const fRoles = permData.roles.filter((r) => match(r.name));
  const fDepts = permData.departments.filter((d) => match(d.name));
  const fPeople = permData.people.filter((u) => match(u.name));
  const nothing = fRoles.length + fDepts.length + fPeople.length === 0;

  return (
    <>
      <button onClick={onBack} className={`${menuItem} flex items-center gap-1 text-muted`}>
        ‹ Who can edit
      </button>
      <Divider />
      <div className="px-1 pb-1">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search roles, teams, people…"
          className="w-full rounded border border-hair px-2 py-1 text-xs outline-none focus:border-teal"
        />
      </div>
      <div className="max-h-72 overflow-y-auto scroll-thin px-1">
        {fRoles.length > 0 && (
          <p className="px-1 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted/70">
            Roles
          </p>
        )}
        {fRoles.map((r) => (
          <PermCheck
            key={r.id}
            label={r.name}
            checked={roles.includes(r.id)}
            onToggle={() => toggle(r.id, roles, setRoles)}
          />
        ))}
        {fDepts.length > 0 && (
          <p className="px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted/70">
            Teams / Departments
          </p>
        )}
        {fDepts.map((d) => (
          <PermCheck
            key={d.id}
            label={d.name}
            checked={departments.includes(d.id)}
            onToggle={() => toggle(d.id, departments, setDepartments)}
          />
        ))}
        {fPeople.length > 0 && (
          <p className="px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted/70">
            People
          </p>
        )}
        {fPeople.map((u) => (
          <PermCheck
            key={u.id}
            label={u.name}
            checked={users.includes(u.id)}
            onToggle={() => toggle(u.id, users, setUsers)}
          />
        ))}
        {nothing && (
          <p className="px-2 py-3 text-center text-xs text-muted">No matches for “{q.trim()}”</p>
        )}
      </div>
      <Divider />
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-[11px] text-muted">
          {total === 0 ? "Anyone (none selected)" : `${total} selected`}
        </span>
        <button
          onClick={save}
          disabled={pending}
          className="rounded-md bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-deep disabled:opacity-60 disabled:cursor-wait"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}

function PermCheck({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`${menuItem} flex items-center justify-between`}
    >
      <span className="truncate">{label}</span>
      <span
        className={`grid h-4 w-4 flex-none place-items-center rounded border text-[10px] ${
          checked ? "border-teal bg-teal text-white" : "border-hair text-transparent"
        }`}
      >
        ✓
      </span>
    </button>
  );
}

// Editor for a column's default value applied to new items. Status shows a
// label picker; date/number/text use the matching input. Types that can't
// carry a simple preset (person/connection/mirror/file/signature) are skipped.
function DefaultValueEditor({
  column,
  boardId,
  onClose,
}: {
  column: ColumnData;
  boardId: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState(column.defaultValue ?? "");
  const [pending, start] = useTransition();
  const supported = ["status", "text", "longtext", "number", "date", "email", "phone"].includes(
    column.type
  );
  const inputType =
    column.type === "number"
      ? "number"
      : column.type === "date"
      ? "date"
      : column.type === "email"
      ? "email"
      : column.type === "phone"
      ? "tel"
      : "text";

  function save(v: string) {
    start(() => void setColumnDefault(boardId, column.id, v || null));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm animate-rise rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <h2 className="text-lg font-bold text-ink">Default value</h2>
        <p className="mt-0.5 text-sm text-muted">
          Applied to “{column.name}” whenever a new item is added.
        </p>

        {!supported ? (
          <p className="mt-4 text-sm text-muted">
            Default values aren’t available for {COLUMN_TYPE_META[column.type]?.label} columns.
          </p>
        ) : column.type === "status" ? (
          <div className="mt-3 flex flex-col gap-1.5">
            {column.labels.map((l) => (
              <button
                key={l.id}
                onClick={() => save(l.id)}
                className={`rounded px-2 py-1.5 text-left text-xs font-medium text-white ${
                  value === l.id ? "ring-2 ring-ink/40" : ""
                }`}
                style={{ background: l.color }}
              >
                {l.label}
              </button>
            ))}
          </div>
        ) : (
          <input
            autoFocus
            type={inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save(value)}
            placeholder="Default…"
            className="mt-3 w-full rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
          />
        )}

        <div className="mt-4 flex justify-between">
          <button
            onClick={() => save("")}
            className="rounded-lg px-3 py-2 text-sm text-muted hover:text-danger"
          >
            Clear default
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">
              Cancel
            </button>
            {supported && column.type !== "status" && (
              <button
                onClick={() => save(value)}
                disabled={pending}
                className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-60 disabled:cursor-wait"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-hair" />;
}

const menuItem = "block w-full rounded px-2 py-1.5 text-left text-sm text-body hover:bg-canvas";

function DescriptionEditor({
  boardId,
  columnId,
  columnName,
  initial,
  onClose,
}: {
  boardId: string;
  columnId: string;
  columnName: string;
  initial: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm animate-rise rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <h2 className="text-lg font-bold text-ink">Column description</h2>
        <p className="mt-0.5 text-sm text-muted">
          Shown as a tooltip on the “{columnName}” header.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="What is this column for?"
          className="mt-3 w-full resize-none rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas disabled:opacity-60">Cancel</button>
          <button
            onClick={() => {
              start(() => void setColumnDescription(boardId, columnId, text));
              onClose();
            }}
            disabled={pending}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-60 disabled:cursor-wait"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [pending, start] = useTransition();

  const update = (i: number, patch: Partial<StatusLabel>) =>
    setLabels((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLabel = () =>
    setLabels((ls) => [
      ...ls,
      { id: `l${Math.random().toString(36).slice(2, 8)}`, label: "New label", color: PALETTE[ls.length % PALETTE.length] },
    ]);
  const save = () => {
    start(() => void setColumnLabels(boardId, columnId, labels));
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-md animate-rise flex-col overflow-hidden rounded-2xl border border-hair bg-white shadow-pop">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hair px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-ink">Edit status labels</h2>
            <p className="mt-0.5 text-xs text-muted">Rename, recolour, add or remove labels.</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Rows (scroll) */}
        <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4 scroll-thin">
          {labels.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">No labels yet — add your first below.</p>
          )}
          {labels.map((l, i) => (
            <div key={l.id} className="flex items-center gap-3 rounded-xl border border-hair p-2.5">
              {/* colour picker + swatch */}
              <label className="relative h-9 w-9 flex-none cursor-pointer overflow-hidden rounded-lg border border-hair" title="Pick colour">
                <span className="block h-full w-full" style={{ background: l.color }} />
                <input
                  type="color"
                  value={l.color}
                  onChange={(e) => update(i, { color: e.target.value })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              {/* name */}
              <input
                value={l.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Label name"
                className="min-w-0 flex-1 rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
              />
              {/* live preview pill */}
              <span
                className="hidden max-w-[7rem] truncate rounded-full px-2.5 py-1 text-xs font-medium text-white sm:inline-block"
                style={{ background: l.color }}
                title="Preview"
              >
                {l.label.trim() || "Preview"}
              </span>
              {/* delete */}
              <button
                onClick={() => setLabels((ls) => ls.filter((_, idx) => idx !== i))}
                className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
                title="Delete label"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={addLabel}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-hair py-2.5 text-sm font-medium text-teal hover:border-teal hover:bg-teal/5"
          >
            <span className="text-base leading-none">＋</span> Add label
          </button>
        </div>

        {/* Sticky footer */}
        <div className="flex items-center justify-between border-t border-hair px-5 py-3">
          <span className="text-xs text-muted">{labels.length} label{labels.length === 1 ? "" : "s"}</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={pending} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas disabled:opacity-60">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-teal px-5 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-60 disabled:cursor-wait"
            >
              {pending ? "Saving…" : "Save labels"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
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
