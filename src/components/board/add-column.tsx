"use client";

import { useState, useTransition } from "react";
import { COLUMN_TYPE_META, COLUMN_TYPES, type ColumnType } from "@/lib/constants";
import { addColumn } from "@/app/actions/board";

type BoardLite = { id: string; name: string };
type ColLite = { id: string; name: string; type: string };
type ConnCol = { id: string; name: string; targetBoardId?: string };

export function AddColumnButton({
  boardId,
  allBoards,
  boardColumnsMap,
  connectionColumns,
}: {
  boardId: string;
  allBoards: BoardLite[];
  boardColumnsMap: Record<string, ColLite[]>;
  connectionColumns: ConnCol[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<ColumnType>("text");
  const [targetBoardId, setTargetBoardId] = useState(allBoards[0]?.id ?? "");
  const [connColId, setConnColId] = useState(connectionColumns[0]?.id ?? "");
  const [sourceColId, setSourceColId] = useState("");
  const [, start] = useTransition();

  const mirrorSource = connectionColumns.find((c) => c.id === connColId);
  const mirrorSourceCols = mirrorSource?.targetBoardId
    ? boardColumnsMap[mirrorSource.targetBoardId] ?? []
    : [];

  function reset() {
    setName("");
    setType("text");
    setOpen(false);
  }

  function submit() {
    if (!name.trim()) return;
    let extra: Record<string, unknown> | undefined;
    if (type === "connection") {
      if (!targetBoardId) return;
      extra = { targetBoardId };
    } else if (type === "mirror") {
      if (!connColId || !sourceColId) return;
      extra = { connectionColumnId: connColId, sourceColumnId: sourceColId };
    }
    start(() => void addColumn(boardId, name, type, extra));
    reset();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep"
      >
        + Column
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-hair bg-white p-3 shadow-pop">
            <label className="mb-1 block text-xs font-semibold text-body">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Column name"
              className="mb-3 w-full rounded-lg border border-hair px-2.5 py-2 text-sm outline-none focus:border-teal"
            />
            <label className="mb-1.5 block text-xs font-semibold text-body">Type</label>
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {COLUMN_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-[11px] transition ${
                    type === t
                      ? "border-teal bg-teal/5 text-teal"
                      : "border-hair text-muted hover:border-teal/50"
                  }`}
                >
                  <span className="font-mono text-sm">{COLUMN_TYPE_META[t].icon}</span>
                  {COLUMN_TYPE_META[t].label}
                </button>
              ))}
            </div>

            {/* connection config */}
            {type === "connection" && (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-semibold text-body">Connect to board</label>
                {allBoards.length === 0 ? (
                  <p className="text-xs text-muted">No other boards to connect to.</p>
                ) : (
                  <select
                    value={targetBoardId}
                    onChange={(e) => setTargetBoardId(e.target.value)}
                    className="w-full rounded-lg border border-hair px-2.5 py-2 text-sm outline-none focus:border-teal"
                  >
                    {allBoards.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* mirror config */}
            {type === "mirror" && (
              <div className="mb-3 grid gap-2">
                {connectionColumns.length === 0 ? (
                  <p className="text-xs text-muted">
                    Add a <b>Connect Board</b> column first, then mirror a field from it.
                  </p>
                ) : (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-body">Via connection</label>
                      <select
                        value={connColId}
                        onChange={(e) => {
                          setConnColId(e.target.value);
                          setSourceColId("");
                        }}
                        className="w-full rounded-lg border border-hair px-2.5 py-2 text-sm outline-none focus:border-teal"
                      >
                        {connectionColumns.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-body">Mirror field</label>
                      <select
                        value={sourceColId}
                        onChange={(e) => setSourceColId(e.target.value)}
                        className="w-full rounded-lg border border-hair px-2.5 py-2 text-sm outline-none focus:border-teal"
                      >
                        <option value="">— select —</option>
                        {mirrorSourceCols.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-canvas">
                Cancel
              </button>
              <button
                onClick={submit}
                className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep"
              >
                Add column
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
