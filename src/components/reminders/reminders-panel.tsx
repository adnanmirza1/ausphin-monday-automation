"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  createReminderRule,
  toggleReminderRule,
  deleteReminderRule,
  runRemindersNow,
} from "@/app/actions/reminders";
import type { UpcomingRow } from "@/lib/reminders";

type Col = { id: string; name: string };
type Dep = { id: string; name: string };
type Rule = {
  id: string;
  name: string;
  dateColumnId: string;
  offsets: number[];
  notifyDepartmentId: string | null;
  enabled: boolean;
};

const OFFSET_CHOICES = [30, 21, 14, 7, 5, 3, 2, 1, 0];

export function RemindersPanel({
  boardId,
  boardName,
  environmentName,
  dateColumns,
  departments,
  rules,
  upcoming,
}: {
  boardId: string;
  boardName: string;
  environmentName: string;
  dateColumns: Col[];
  departments: Dep[];
  rules: Rule[];
  upcoming: UpcomingRow[];
}) {
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [, start] = useTransition();

  function runNow() {
    start(async () => {
      const fired = await runRemindersNow(boardId);
      setToast(
        fired.length ? `Sent ${fired.length} reminder${fired.length === 1 ? "" : "s"}.` : "No reminders due today."
      );
      setTimeout(() => setToast(null), 3500);
    });
  }

  const colName = (id: string) => dateColumns.find((c) => c.id === id)?.name ?? "date";
  const depName = (id: string | null) =>
    id ? departments.find((d) => d.id === id)?.name ?? "team" : null;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
              {environmentName} · Reminders
            </p>
            <h1 className="truncate text-lg font-bold text-ink">{boardName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/boards/${boardId}`}
              className="rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas"
            >
              ← Board
            </Link>
            <button
              onClick={runNow}
              className="rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-body hover:bg-canvas"
            >
              ▶ Run now
            </button>
            <button
              onClick={() => setCreating(true)}
              disabled={dateColumns.length === 0}
              className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
              title={dateColumns.length === 0 ? "Add a date column first" : ""}
            >
              + New reminder
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto scroll-thin p-4 sm:p-6">
        {dateColumns.length === 0 && (
          <p className="mb-4 rounded-lg border border-dashed border-hair bg-white p-4 text-sm text-muted">
            This board has no <b>date</b> column yet. Add one (e.g. “Visa Expiry”) to
            create reminders.
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Rules */}
          <section>
            <h2 className="mb-2 text-sm font-bold text-ink">Rules</h2>
            {rules.length === 0 && (
              <p className="rounded-xl border border-dashed border-hair bg-white py-8 text-center text-sm text-muted">
                No reminder rules yet.
              </p>
            )}
            <div className="grid gap-2">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-xl border border-hair bg-white p-4 shadow-soft ${
                    r.enabled ? "" : "opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{r.name}</p>
                      <p className="mt-0.5 text-xs text-body">
                        Before <span className="font-medium text-teal-deep">{colName(r.dateColumnId)}</span>
                        {depName(r.notifyDepartmentId) && (
                          <> · notify <span className="font-medium text-amber">@{depName(r.notifyDepartmentId)}</span></>
                        )}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.offsets.map((o) => (
                          <span key={o} className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                            {o === 0 ? "day of" : `${o}d`}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-none items-center gap-2">
                      <Toggle
                        on={r.enabled}
                        onChange={(v) => start(() => void toggleReminderRule(boardId, r.id, v))}
                      />
                      <button
                        onClick={() => start(() => void deleteReminderRule(boardId, r.id))}
                        className="text-xs text-muted hover:text-danger"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Upcoming */}
          <section>
            <h2 className="mb-2 text-sm font-bold text-ink">Upcoming (next 45 days)</h2>
            <div className="rounded-xl border border-hair bg-white shadow-soft">
              {upcoming.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">Nothing upcoming.</p>
              ) : (
                upcoming.map((u, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b border-hair px-4 py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{u.itemName}</p>
                      <p className="text-xs text-muted">{u.ruleName} · {u.dateStr}</p>
                    </div>
                    <span
                      className="flex-none rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
                      style={{ background: u.daysLeft <= 3 ? "#C0392B" : u.daysLeft <= 7 ? "#C67A1E" : "#5B7A99" }}
                    >
                      {u.daysLeft === 0 ? "today" : `${u.daysLeft}d`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {creating && (
        <CreateModal
          dateColumns={dateColumns}
          departments={departments}
          onClose={() => setCreating(false)}
          onSubmit={(input) => {
            start(() => void createReminderRule(boardId, input));
            setCreating(false);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white shadow-pop">
          {toast}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full transition ${on ? "bg-teal" : "bg-hair"}`}
      role="switch"
      aria-checked={on}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${on ? "left-4" : "left-0.5"}`} />
    </button>
  );
}

function CreateModal({
  dateColumns,
  departments,
  onClose,
  onSubmit,
}: {
  dateColumns: Col[];
  departments: Dep[];
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    dateColumnId: string;
    offsets: number[];
    notifyDepartmentId: string | null;
    message: string;
  }) => void;
}) {
  const [name, setName] = useState("Visa expiry reminder");
  const [dateColumnId, setDateColumnId] = useState(dateColumns[0]?.id ?? "");
  const [offsets, setOffsets] = useState<number[]>([30, 21, 14, 7, 5, 3, 2, 1]);
  const [dept, setDept] = useState<string>("");
  const [message, setMessage] = useState("");

  function toggleOffset(o: number) {
    setOffsets((cur) => (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o].sort((a, b) => b - a)));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <h2 className="text-lg font-bold text-ink">New reminder</h2>
        <p className="mt-0.5 text-sm text-muted">Notify before a date arrives.</p>

        <div className="mt-4 grid gap-3">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inp} />
          </Field>
          <Field label="Date column">
            <select value={dateColumnId} onChange={(e) => setDateColumnId(e.target.value)} className={inp}>
              {dateColumns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-body">Notify these days before</p>
            <div className="flex flex-wrap gap-1.5">
              {OFFSET_CHOICES.map((o) => (
                <button
                  key={o}
                  onClick={() => toggleOffset(o)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    offsets.includes(o)
                      ? "border-teal bg-teal/10 text-teal-deep"
                      : "border-hair text-muted hover:border-teal/40"
                  }`}
                >
                  {o === 0 ? "day of" : `${o}d`}
                </button>
              ))}
            </div>
          </div>
          <Field label="Notify department">
            <select value={dept} onChange={(e) => setDept(e.target.value)} className={inp}>
              <option value="">— none —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Message (optional)">
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Visa expiring soon" className={inp} />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({ name, dateColumnId, offsets, notifyDepartmentId: dept || null, message })
            }
            disabled={!dateColumnId}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            Create reminder
          </button>
        </div>
      </div>
    </div>
  );
}

const inp =
  "w-full rounded-lg border border-hair bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-teal";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-body">{label}</span>
      {children}
    </label>
  );
}
