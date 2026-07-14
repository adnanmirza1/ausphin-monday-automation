"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ColumnData, CellData, PersonLite } from "@/lib/board-types";
import { setCell, setPersonCell, addStatusLabel } from "@/app/actions/board";
import { PALETTE } from "@/lib/constants";
import { createPortal } from "react-dom";
import {
  parseUrlValue,
  urlDisplay,
  urlHref,
  serializeUrlValue,
  parseFileValue,
  type FileValue,
} from "@/lib/cell-values";
import { EmailComposer } from "@/components/board/email-composer";

// ── Input sanitizers (Improvement #6) ────────────────────────────────
// Numbers: digits, a single decimal point, optional leading minus. No letters.
function sanitizeNumber(s: string): string {
  let out = s.replace(/[^0-9.-]/g, "");
  // keep only a leading "-"
  const neg = out.startsWith("-");
  out = out.replace(/-/g, "");
  // keep only the first "."
  const firstDot = out.indexOf(".");
  if (firstDot !== -1) {
    out = out.slice(0, firstDot + 1) + out.slice(firstDot + 1).replace(/\./g, "");
  }
  return (neg ? "-" : "") + out;
}
// Phones: digits and the permitted symbols + space - ( ) . No letters.
function sanitizePhone(s: string): string {
  return s.replace(/[^0-9+\-() .]/g, "");
}
// Max size for an uploaded file kept as a data URL in the DB (Improvement #7).
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB

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
      return (
        <InputCell {...props} inputType="text" inputMode="decimal" sanitize={sanitizeNumber} />
      );
    case "email":
      return <EmailCell {...props} />;
    case "phone":
      return <PhoneCell {...props} />;
    case "url":
      return <UrlCell {...props} />;
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
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [, start] = useTransition();
  const current = column.labels.find((l) => l.id === cell?.value);
  const btnRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    setQ("");
    setAdding(false);
    setNewLabel("");
  }
  function pick(id: string | null) {
    close();
    start(() => void setCell(boardId, itemId, column.id, id));
  }
  function create(label: string, color?: string) {
    close();
    start(() => void addStatusLabel(boardId, column.id, itemId, label, color));
  }
  // Open the add panel, pre-filling from whatever was typed in the search box.
  function startAdding() {
    setNewLabel(q.trim());
    setNewColor(PALETTE[column.labels.length % PALETTE.length]);
    setAdding(true);
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
        <FloatingPanel anchorRef={btnRef} onClose={close} width={204}>
          <div className="flex max-h-full flex-col rounded-lg border border-hair bg-white p-1.5 shadow-pop">
            {adding ? (
              /* ── Add-a-new-label panel (name + colour) ── */
              <div className="flex flex-col gap-2 p-1">
                <p className="text-xs font-semibold text-body">New label</p>
                <input
                  autoFocus
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newLabel.trim()) create(newLabel.trim(), newColor);
                    if (e.key === "Escape") setAdding(false);
                  }}
                  placeholder="Label name"
                  className="w-full rounded border border-hair px-2 py-1 text-xs outline-none focus:border-teal"
                />
                <div className="flex flex-wrap gap-1">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className={`h-5 w-5 rounded ${newColor === c ? "ring-2 ring-ink/40 ring-offset-1" : ""}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                {/* live preview */}
                <span
                  className="rounded px-2 py-1 text-center text-xs font-medium text-white"
                  style={{ background: newColor }}
                >
                  {newLabel.trim() || "Preview"}
                </span>
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => setAdding(false)}
                    className="rounded px-2 py-1 text-xs text-muted hover:bg-canvas"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!newLabel.trim()}
                    onClick={() => create(newLabel.trim(), newColor)}
                    className="rounded bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <>
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
                <div className="mt-1 border-t border-hair pt-1">
                  <button
                    onClick={startAdding}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs font-medium text-teal hover:bg-teal/5"
                  >
                    <span className="text-sm leading-none">＋</span> Add label
                  </button>
                  <button
                    onClick={() => pick(null)}
                    className="block w-full rounded px-2 py-1 text-left text-xs text-muted hover:bg-canvas"
                  >
                    Clear
                  </button>
                </div>
              </>
            )}
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
  inputMode,
  sanitize,
}: Ctx & {
  inputType: string;
  inputMode?: "decimal" | "numeric" | "text";
  sanitize?: (s: string) => string;
}) {
  const [value, setValue] = useState(cell?.value ?? "");
  const [seen, setSeen] = useState(cell?.value ?? "");
  const [, start] = useTransition();
  // Re-sync the input when the cell value changes externally (React docs:
  // "You Might Not Need an Effect" — adjusting state when a prop changes).
  if ((cell?.value ?? "") !== seen) {
    setSeen(cell?.value ?? "");
    setValue(cell?.value ?? "");
  }

  function commit() {
    if ((cell?.value ?? "") === value) return;
    start(() => void setCell(boardId, itemId, column.id, value || null));
  }

  return (
    <input
      type={inputType}
      inputMode={inputMode}
      value={value}
      disabled={readOnly}
      onChange={(e) => setValue(sanitize ? sanitize(e.target.value) : e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="h-full w-full bg-transparent px-2 text-center text-xs text-body outline-none focus:bg-teal/5"
    />
  );
}

/* ── Email (click → compose inside the platform — #2) ── */
function EmailCell({ boardId, itemId, column, cell, readOnly }: Ctx) {
  const [editing, setEditing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [value, setValue] = useState(cell?.value ?? "");
  const [seen, setSeen] = useState(cell?.value ?? "");
  const [, start] = useTransition();
  // Re-sync the input when the cell value changes externally.
  if ((cell?.value ?? "") !== seen) {
    setSeen(cell?.value ?? "");
    setValue(cell?.value ?? "");
  }

  function commit() {
    setEditing(false);
    if ((cell?.value ?? "") !== value)
      start(() => void setCell(boardId, itemId, column.id, value || null));
  }

  const email = cell?.value;
  if (editing || !email) {
    return (
      <input
        type="email"
        autoFocus={editing}
        value={value}
        disabled={readOnly}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder={readOnly ? "" : "email…"}
        className="h-full w-full bg-transparent px-2 text-center text-xs text-body outline-none focus:bg-teal/5"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center gap-1 px-1.5">
      <button
        onClick={() => setComposing(true)}
        title={`Compose email to ${email}`}
        className="truncate text-xs text-teal hover:underline"
      >
        {email}
      </button>
      {!readOnly && (
        <button
          onClick={() => setEditing(true)}
          title="Edit email"
          className="flex-none text-[10px] text-muted hover:text-body"
        >
          ✎
        </button>
      )}
      {composing && (
        <EmailComposer
          boardId={boardId}
          itemId={itemId}
          defaultTo={email}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}

/* ── Phone (shows country flag + name by dialing code) ── */
// [dial code, flag, country name] — longest codes first so "+971" beats "+9".
const DIAL_COUNTRIES: [string, string, string][] = [
  ["+880", "🇧🇩", "Bangladesh"], ["+971", "🇦🇪", "United Arab Emirates"], ["+974", "🇶🇦", "Qatar"],
  ["+968", "🇴🇲", "Oman"], ["+973", "🇧🇭", "Bahrain"], ["+965", "🇰🇼", "Kuwait"],
  ["+966", "🇸🇦", "Saudi Arabia"], ["+234", "🇳🇬", "Nigeria"], ["+254", "🇰🇪", "Kenya"],
  ["+63", "🇵🇭", "Philippines"], ["+61", "🇦🇺", "Australia"], ["+64", "🇳🇿", "New Zealand"],
  ["+65", "🇸🇬", "Singapore"], ["+60", "🇲🇾", "Malaysia"], ["+62", "🇮🇩", "Indonesia"],
  ["+66", "🇹🇭", "Thailand"], ["+84", "🇻🇳", "Vietnam"], ["+91", "🇮🇳", "India"],
  ["+92", "🇵🇰", "Pakistan"], ["+86", "🇨🇳", "China"], ["+81", "🇯🇵", "Japan"],
  ["+82", "🇰🇷", "South Korea"], ["+44", "🇬🇧", "United Kingdom"], ["+49", "🇩🇪", "Germany"],
  ["+33", "🇫🇷", "France"], ["+39", "🇮🇹", "Italy"], ["+34", "🇪🇸", "Spain"],
  ["+90", "🇹🇷", "Turkey"], ["+55", "🇧🇷", "Brazil"], ["+52", "🇲🇽", "Mexico"],
  ["+27", "🇿🇦", "South Africa"], ["+20", "🇪🇬", "Egypt"], ["+7", "🇷🇺", "Russia"],
  ["+1", "🇺🇸", "United States"],
];
function countryForPhone(raw: string): { flag: string; name: string } {
  const p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("+"))
    for (const [code, flag, name] of DIAL_COUNTRIES)
      if (p.startsWith(code)) return { flag, name };
  return { flag: "🌐", name: "Unknown" };
}

function PhoneCell({ boardId, itemId, column, cell, readOnly }: Ctx) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(cell?.value ?? "");
  const [seen, setSeen] = useState(cell?.value ?? "");
  const [, start] = useTransition();
  // Re-sync the input when the cell value changes externally.
  if ((cell?.value ?? "") !== seen) {
    setSeen(cell?.value ?? "");
    setValue(cell?.value ?? "");
  }

  function commit() {
    setEditing(false);
    if ((cell?.value ?? "") !== value)
      start(() => void setCell(boardId, itemId, column.id, value || null));
  }

  const phone = cell?.value;
  if (editing || !phone) {
    return (
      <input
        type="tel"
        inputMode="tel"
        autoFocus={editing}
        value={value}
        disabled={readOnly}
        onChange={(e) => setValue(sanitizePhone(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder={readOnly ? "" : "+61…"}
        className="h-full w-full bg-transparent px-2 text-center text-xs text-body outline-none focus:bg-teal/5"
      />
    );
  }
  const country = countryForPhone(phone);
  return (
    <div className="flex h-full w-full min-w-0 items-center justify-center gap-1.5 px-1.5">
      <span className="flex-none text-sm leading-none" title={country.name}>
        {country.flag}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[11px] font-medium text-body" title={country.name}>
          {country.name}
        </span>
        <a
          href={`tel:${phone.replace(/[^\d+]/g, "")}`}
          title={`Call ${phone}`}
          className="truncate text-[11px] text-muted hover:text-teal"
        >
          {phone}
        </a>
      </span>
      {!readOnly && (
        <button
          onClick={() => setEditing(true)}
          title="Edit phone"
          className="flex-none text-[10px] text-muted hover:text-body"
        >
          ✎
        </button>
      )}
    </div>
  );
}

/* ── URL / Link (custom display name — Additional #1) ── */
function UrlCell({ boardId, itemId, column, cell, readOnly }: Ctx) {
  const parsed = parseUrlValue(cell?.value);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(parsed.url);
  const [label, setLabel] = useState(parsed.label ?? "");
  const btnRef = useRef<HTMLButtonElement>(null);
  const [seen, setSeen] = useState<string | null>(cell?.value ?? null);
  const [, start] = useTransition();

  // Re-sync local fields when the cell value changes externally.
  if ((cell?.value ?? null) !== seen) {
    const p = parseUrlValue(cell?.value);
    setSeen(cell?.value ?? null);
    setUrl(p.url);
    setLabel(p.label ?? "");
  }

  function save() {
    setEditing(false);
    const next = serializeUrlValue(url, label);
    if ((cell?.value ?? null) !== next)
      start(() => void setCell(boardId, itemId, column.id, next));
  }

  const hasLink = !!cell?.value && !!parseUrlValue(cell?.value).url;

  return (
    <div className="relative flex h-full w-full items-center justify-center gap-1 px-1.5">
      {hasLink ? (
        <a
          href={urlHref(cell?.value)}
          target="_blank"
          rel="noreferrer"
          title={parseUrlValue(cell?.value).url}
          className="truncate text-xs text-teal hover:underline"
        >
          🔗 {urlDisplay(cell?.value)}
        </a>
      ) : (
        !readOnly && (
          <button
            ref={btnRef}
            onClick={() => setEditing(true)}
            className="text-xs text-muted hover:text-body"
          >
            ＋ Link
          </button>
        )
      )}
      {hasLink && !readOnly && (
        <button
          ref={btnRef}
          onClick={() => setEditing(true)}
          title="Edit link & display name"
          className="flex-none text-[10px] text-muted hover:text-body"
        >
          ✎
        </button>
      )}
      {editing && (
        <FloatingPanel anchorRef={btnRef} onClose={save} width={248}>
          <div className="flex flex-col gap-2 rounded-lg border border-hair bg-white p-2.5 shadow-pop">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-body">URL</label>
              <input
                autoFocus
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="https://example.com/candidate-document"
                className="w-full rounded border border-hair px-2 py-1 text-xs outline-none focus:border-teal"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-body">
                Display name <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="Candidate Document"
                className="w-full rounded border border-hair px-2 py-1 text-xs outline-none focus:border-teal"
              />
            </div>
            <div className="flex justify-end gap-1.5">
              {hasLink && (
                <button
                  onClick={() => {
                    setUrl("");
                    setLabel("");
                    setEditing(false);
                    start(() => void setCell(boardId, itemId, column.id, null));
                  }}
                  className="mr-auto rounded px-2 py-1 text-xs text-muted hover:text-danger"
                >
                  Clear
                </button>
              )}
              <button onClick={save} className="rounded bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-deep">
                Save
              </button>
            </div>
          </div>
        </FloatingPanel>
      )}
    </div>
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

/* ── File (upload + open/download — Improvement #7) ──── */
function FileCell({ boardId, itemId, column, cell, readOnly }: Ctx) {
  const files = parseFileValue(cell?.value);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [, start] = useTransition();

  function persist(next: FileValue[]) {
    const value = next.length ? JSON.stringify(next) : null;
    start(() => void setCell(boardId, itemId, column.id, value));
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (chosen.length === 0) return;
    setError("");
    const tooBig = chosen.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is over 3 MB.`);
      return;
    }
    setBusy(true);
    Promise.all(
      chosen.map(
        (f) =>
          new Promise<FileValue>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({ name: f.name, type: f.type, url: String(reader.result) });
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(f);
          })
      )
    )
      .then((added) => {
        // Only keep real uploaded files (drop a legacy doc-link placeholder).
        const existing = files.filter((f) => f.url.startsWith("data:"));
        persist([...existing, ...added]);
        setBusy(false);
      })
      .catch(() => {
        setError("Could not read that file.");
        setBusy(false);
      });
  }

  function removeAt(idx: number) {
    persist(files.filter((_, i) => i !== idx));
  }

  const count = files.length;

  return (
    <div className="relative grid h-full place-items-center px-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={onPick}
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip"
      />
      <button
        ref={btnRef}
        disabled={readOnly}
        onClick={() => (count > 0 ? setOpen(true) : inputRef.current?.click())}
        className="flex h-full w-full min-w-0 items-center justify-center gap-1 px-1 text-xs"
        title={count > 0 ? (count === 1 ? files[0].name : `${count} files`) : readOnly ? "" : "Upload file"}
      >
        {busy ? (
          <span className="text-muted">Uploading…</span>
        ) : count > 0 ? (
          <span className="flex min-w-0 max-w-[160px] items-center gap-1 font-medium text-teal">
            <span className="flex-none">📎</span>
            <span className="truncate">{count === 1 ? files[0].name : `${count} files`}</span>
          </span>
        ) : (
          <span className="text-muted">{readOnly ? "" : "⬆ Upload"}</span>
        )}
      </button>
      {error && <span className="absolute -bottom-4 text-[10px] text-danger">{error}</span>}
      {open && (
        <FloatingPanel anchorRef={btnRef} onClose={() => setOpen(false)} width={248}>
          <div className="flex flex-col gap-1 rounded-lg border border-hair bg-white p-2 shadow-pop">
            <p className="px-1 pb-1 text-[11px] font-semibold text-body">Files</p>
            <div className="max-h-52 overflow-y-auto scroll-thin">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded px-1 py-1 hover:bg-canvas">
                  <a
                    href={f.url}
                    download={f.url.startsWith("data:") ? f.name : undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 truncate text-xs text-teal hover:underline"
                    title={f.name}
                  >
                    📄 {f.name}
                  </a>
                  {!readOnly && (
                    <button
                      onClick={() => removeAt(i)}
                      title="Remove"
                      className="flex-none text-[10px] text-muted hover:text-danger"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!readOnly && (
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-1 rounded border border-dashed border-hair px-2 py-1.5 text-xs font-medium text-teal hover:bg-teal/5"
              >
                ＋ Add file
              </button>
            )}
          </div>
        </FloatingPanel>
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
