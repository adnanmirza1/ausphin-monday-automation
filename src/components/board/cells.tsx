"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ColumnData, CellData, PersonLite } from "@/lib/board-types";
import { setCell, setPersonCell, addStatusLabel } from "@/app/actions/board";
import { createPortal } from "react-dom";

type Ctx = {
  boardId: string;
  itemId: string;
  column: ColumnData;
  cell?: CellData;
  people: PersonLite[];
  readOnly: boolean;
  options?: { id: string; name: string }[]; // connection candidates
};

export function Cell(props: Ctx) {
  switch (props.column.type) {
    case "status":
      return <StatusCell {...props} />;
    case "person":
      return <PersonCell {...props} />;
    case "signature":
      return <SignatureCell {...props} />;
    case "connection":
      return <ConnectionCell {...props} />;
    case "mirror":
      return <MirrorCell {...props} />;
    case "file":
      return <FileCell {...props} />;
    case "date":
      return <InputCell {...props} inputType="date" />;
    case "number":
      return <InputCell {...props} inputType="number" />;
    case "email":
      return <InputCell {...props} inputType="email" />;
    case "phone":
      return <InputCell {...props} inputType="tel" />;
    default:
      return <InputCell {...props} inputType="text" />;
  }
}

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("");
}

/* ── Status ─────────────────────────────────────────── */
function StatusCell({ boardId, itemId, column, cell, readOnly }: Ctx) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const current = column.labels.find((l) => l.id === cell?.value);
  const btnRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    setQ("");
  }
  function pick(id: string | null) {
    close();
    start(() => void setCell(boardId, itemId, column.id, id));
  }
  function create(label: string) {
    close();
    start(() => void addStatusLabel(boardId, column.id, itemId, label));
  }

  const query = q.trim();
  const filtered = query
    ? column.labels.filter((l) =>
        l.label.toLowerCase().includes(query.toLowerCase())
      )
    : column.labels;
  const exists = column.labels.some(
    (l) => l.label.trim().toLowerCase() === query.toLowerCase()
  );

  return (
    <div className="relative h-full">
      <button
        ref={btnRef}
        disabled={readOnly}
        onClick={() => setOpen((o) => !o)}
        className="flex h-full w-full items-center justify-center px-2 text-xs font-medium text-white transition"
        style={{ background: current?.color ?? "transparent" }}
      >
        <span className={current ? "" : "text-muted"}>
          {current?.label ?? (readOnly ? "" : "—")}
        </span>
      </button>
      {open && (
        <FloatingPanel anchorRef={btnRef} onClose={close} width={192}>
          <div className="flex max-h-full flex-col rounded-lg border border-hair bg-white p-1.5 shadow-pop">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query && !exists) create(query);
                if (e.key === "Escape") close();
              }}
              placeholder="Search or create…"
              className="mb-1.5 w-full rounded border border-hair px-2 py-1 text-xs outline-none focus:border-teal"
            />
            <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
              {filtered.map((l) => (
                <button
                  key={l.id}
                  onClick={() => pick(l.id)}
                  className="mb-1 block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-white"
                  style={{ background: l.color }}
                >
                  {l.label}
                </button>
              ))}
              {query && !exists && (
                <button
                  onClick={() => create(query)}
                  className="mb-1 flex w-full items-center gap-1.5 rounded border border-dashed border-hair px-2 py-1.5 text-left text-xs font-medium text-teal hover:bg-teal/5"
                >
                  <span className="text-sm leading-none">＋</span>
                  <span className="truncate">Create “{query}”</span>
                </button>
              )}
              {filtered.length === 0 && !query && (
                <p className="px-2 py-2 text-xs text-muted">No labels yet</p>
              )}
            </div>
            <button
              onClick={() => pick(null)}
              className="mt-0.5 block w-full rounded px-2 py-1 text-left text-xs text-muted hover:bg-canvas"
            >
              Clear
            </button>
          </div>
        </FloatingPanel>
      )}
    </div>
  );
}

/* ── Person ─────────────────────────────────────────── */
function PersonCell({ boardId, itemId, column, cell, people, readOnly }: Ctx) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const btnRef = useRef<HTMLButtonElement>(null);
  const person = cell?.person;

  function pick(id: string | null) {
    setOpen(false);
    setQ("");
    start(() => void setPersonCell(boardId, itemId, column.id, id));
  }

  const filtered = people.filter((p) =>
    p.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="relative h-full">
      <button
        ref={btnRef}
        disabled={readOnly}
        onClick={() => setOpen((o) => !o)}
        className="flex h-full w-full items-center justify-center gap-1.5 px-2"
      >
        {person ? (
          <>
            <span
              className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white"
              style={{ background: person.avatarColor }}
            >
              {initials(person.name)}
            </span>
            <span className="truncate text-xs text-body">{person.name}</span>
          </>
        ) : (
          <span className="text-xs text-muted">{readOnly ? "" : "＋"}</span>
        )}
      </button>
      {open && (
        <FloatingPanel anchorRef={btnRef} onClose={() => { setOpen(false); setQ(""); }} width={224}>
          <div className="flex max-h-full flex-col rounded-lg border border-hair bg-white p-2 shadow-pop">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people…"
            className="mb-2 w-full rounded border border-hair px-2 py-1 text-xs outline-none focus:border-teal"
          />
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-canvas"
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: p.avatarColor }}
                >
                  {initials(p.name)}
                </span>
                <span className="truncate text-xs text-body">{p.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-1.5 py-2 text-xs text-muted">No matches</p>
            )}
          </div>
          {person && (
            <button
              onClick={() => pick(null)}
              className="mt-1 block w-full rounded px-2 py-1 text-left text-xs text-muted hover:bg-canvas"
            >
              Remove
            </button>
          )}
          </div>
        </FloatingPanel>
      )}
    </div>
  );
}

/* ── Text / date / number / email / phone ───────────── */
function InputCell({
  boardId,
  itemId,
  column,
  cell,
  readOnly,
  inputType,
}: Ctx & { inputType: string }) {
  const [value, setValue] = useState(cell?.value ?? "");
  const [, start] = useTransition();
  useEffect(() => setValue(cell?.value ?? ""), [cell?.value]);

  function commit() {
    if ((cell?.value ?? "") === value) return;
    start(() => void setCell(boardId, itemId, column.id, value || null));
  }

  return (
    <input
      type={inputType}
      value={value}
      disabled={readOnly}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="h-full w-full bg-transparent px-2 text-center text-xs text-body outline-none focus:bg-teal/5"
    />
  );
}

/* ── Connection (link to an item on another board) ──── */
function ConnectionCell({ boardId, itemId, column, cell, readOnly, options }: Ctx) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const btnRef = useRef<HTMLButtonElement>(null);
  const opts = options ?? [];

  function pick(id: string | null) {
    setOpen(false);
    setQ("");
    start(() => void setCell(boardId, itemId, column.id, id));
  }
  const filtered = opts.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="relative h-full">
      <button
        ref={btnRef}
        disabled={readOnly}
        onClick={() => setOpen((o) => !o)}
        className="flex h-full w-full items-center justify-center px-2"
      >
        {cell?.display ? (
          <span className="truncate rounded-full bg-steel/15 px-2 py-0.5 text-xs font-medium text-steel">
            ⛓ {cell.display}
          </span>
        ) : (
          <span className="text-xs text-muted">{readOnly ? "" : "＋ Link"}</span>
        )}
      </button>
      {open && (
        <FloatingPanel anchorRef={btnRef} onClose={() => { setOpen(false); setQ(""); }} width={224}>
          <div className="flex max-h-full flex-col rounded-lg border border-hair bg-white p-2 shadow-pop">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search items…"
            className="mb-2 w-full rounded border border-hair px-2 py-1 text-xs outline-none focus:border-teal"
          />
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
            {filtered.map((o) => (
              <button
                key={o.id}
                onClick={() => pick(o.id)}
                className="block w-full truncate rounded px-1.5 py-1 text-left text-xs text-body hover:bg-canvas"
              >
                {o.name}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-1.5 py-2 text-xs text-muted">No items</p>}
          </div>
          {cell?.value && (
            <button
              onClick={() => pick(null)}
              className="mt-1 block w-full rounded px-2 py-1 text-left text-xs text-muted hover:bg-canvas"
            >
              Unlink
            </button>
          )}
          </div>
        </FloatingPanel>
      )}
    </div>
  );
}

/* ── Mirror (read-only value from the connected item) ── */
function MirrorCell({ cell }: Ctx) {
  return (
    <div className="grid h-full place-items-center px-2">
      <span className="truncate text-xs text-body" title={cell?.display ?? ""}>
        {cell?.display || <span className="text-muted">—</span>}
      </span>
    </div>
  );
}

/* ── File (link to a generated/attached document) ───── */
function FileCell({ cell }: Ctx) {
  const url = cell?.value;
  return (
    <div className="grid h-full place-items-center px-2">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-xs font-medium text-teal hover:underline"
        >
          📄 Open
        </a>
      ) : (
        <span className="text-xs text-muted">—</span>
      )}
    </div>
  );
}

/* ── Signature ──────────────────────────────────────── */
function SignatureCell({ boardId, itemId, column, cell, readOnly }: Ctx) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const signed = cell?.value?.startsWith("data:image");

  function save(dataUrl: string | null) {
    setOpen(false);
    start(() => void setCell(boardId, itemId, column.id, dataUrl));
  }

  return (
    <div className="grid h-full place-items-center px-1">
      <button
        disabled={readOnly}
        onClick={() => setOpen(true)}
        className="flex h-full w-full items-center justify-center"
        title={signed ? "View / re-sign" : "Add signature"}
      >
        {signed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cell!.value!} alt="signature" className="max-h-8 object-contain" />
        ) : (
          <span className="text-xs text-muted">{readOnly ? "" : "✍ Sign"}</span>
        )}
      </button>
      {open && (
        <SignaturePad
          initial={signed ? cell!.value! : null}
          readOnly={readOnly}
          onClose={() => setOpen(false)}
          onSave={save}
          onClear={() => save(null)}
        />
      )}
    </div>
  );
}

function SignaturePad({
  initial,
  readOnly,
  onClose,
  onSave,
  onClear,
}: {
  initial: string | null;
  readOnly: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#141b26";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (initial) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = initial;
    }
  }, [initial]);

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasRef.current!.width / rect.width),
      y: (e.clientY - rect.top) * (canvasRef.current!.height / rect.height),
    };
  }
  function down(e: React.PointerEvent) {
    if (readOnly) return;
    drawing.current = true;
    dirty.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function up() {
    drawing.current = false;
  }
  function clearPad() {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    dirty.current = false;
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <h2 className="text-lg font-bold text-ink">Signature</h2>
        <p className="mt-0.5 text-sm text-muted">
          {readOnly ? "Signature (read-only)." : "Draw your signature below."}
        </p>
        <canvas
          ref={canvasRef}
          width={440}
          height={180}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="mt-3 w-full touch-none rounded-lg border border-hair bg-white"
          style={{ cursor: readOnly ? "default" : "crosshair" }}
        />
        <div className="mt-4 flex justify-between">
          <div className="flex gap-2">
            {!readOnly && (
              <>
                <button onClick={clearPad} className="rounded-lg border border-hair px-3 py-2 text-sm text-body hover:bg-canvas">
                  Clear
                </button>
                <button onClick={onClear} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-danger">
                  Remove
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">
              Cancel
            </button>
            {!readOnly && (
              <button
                onClick={() => {
                  if (!dirty.current && !initial) return;
                  onSave(canvasRef.current!.toDataURL("image/png"));
                }}
                className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep"
              >
                Save signature
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── outside-click hook ─────────────────────────────── */
// Floating dropdown rendered in a body-level portal so it is never clipped by
// the board card's `overflow-hidden`. Positions itself just below the anchor,
// flips above when there isn't room, and clamps inside the viewport.
function FloatingPanel({
  anchorRef,
  onClose,
  width = 208,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    const openUp = below < 200 && above > below;
    let left = r.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    if (left < margin) left = margin;
    setPos({
      top: openUp ? Math.max(margin, r.top - 4) : r.bottom + 4,
      left,
      maxH: openUp ? above : below,
    });
  }, [anchorRef, width]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!pos) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div
        className="fixed z-50"
        style={{ top: pos.top, left: pos.left, width, maxHeight: pos.maxH }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
