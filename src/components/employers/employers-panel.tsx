"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { TAG_STAGES, TAG_STAGE_META, type TagStage } from "@/lib/constants";
import {
  createEmployer,
  deleteEmployer,
  setTagStage,
  untagCandidate,
} from "@/app/actions/employers";

type Candidate = {
  tagId: string;
  itemId: string;
  name: string;
  board: string;
  boardId: string;
  stage: string;
};
type Employer = {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  candidates: Candidate[];
};

export function EmployersPanel({
  employers,
  isAdmin,
  readOnly,
}: {
  employers: Employer[];
  isAdmin: boolean;
  readOnly: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [, start] = useTransition();

  const totals = employers.reduce(
    (acc, e) => {
      for (const c of e.candidates) {
        if (c.stage === "active") acc.active++;
        else if (c.stage === "interview") acc.interview++;
        else if (c.stage === "placed") acc.placed++;
      }
      return acc;
    },
    { active: 0, interview: 0, placed: 0 }
  );

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Network</p>
            <h1 className="text-lg font-bold text-ink">Employers</h1>
          </div>
          {!readOnly && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-deep"
            >
              + Add employer
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto scroll-thin p-4 sm:p-6">
        {/* org-wide totals */}
        <div className="mb-5 grid grid-cols-3 gap-3 sm:max-w-md">
          <Total label="Interview" value={totals.interview} color={TAG_STAGE_META.interview.color} />
          <Total label="Active" value={totals.active} color={TAG_STAGE_META.active.color} />
          <Total label="Placed" value={totals.placed} color={TAG_STAGE_META.placed.color} />
        </div>

        {employers.length === 0 && (
          <p className="rounded-xl border border-dashed border-hair bg-white py-12 text-center text-sm text-muted">
            No employers yet. Add one, then tag candidates from any item.
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {employers.map((e) => (
            <EmployerCard
              key={e.id}
              employer={e}
              isAdmin={isAdmin}
              readOnly={readOnly}
              onDelete={() => start(() => void deleteEmployer(e.id))}
            />
          ))}
        </div>
      </div>

      {creating && <CreateModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function Total({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-hair bg-white p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function EmployerCard({
  employer,
  isAdmin,
  readOnly,
  onDelete,
}: {
  employer: Employer;
  isAdmin: boolean;
  readOnly: boolean;
  onDelete: () => void;
}) {
  const [, start] = useTransition();
  const count = (stage: string) => employer.candidates.filter((c) => c.stage === stage).length;

  return (
    <div className="rounded-xl border border-hair bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-ink">{employer.name}</h3>
          {(employer.contactEmail || employer.contactPhone) && (
            <p className="text-xs text-muted">
              {[employer.contactEmail, employer.contactPhone].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {isAdmin && (
          <button onClick={onDelete} className="text-xs text-muted hover:text-danger">
            Delete
          </button>
        )}
      </div>

      {/* live counts */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {TAG_STAGES.filter((s) => s !== "past").map((s) => (
          <span
            key={s}
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
            style={{ background: TAG_STAGE_META[s].color }}
          >
            {count(s)} {TAG_STAGE_META[s].label}
          </span>
        ))}
      </div>

      {/* candidates */}
      <div className="mt-3 flex flex-col divide-y divide-hair">
        {employer.candidates.length === 0 && (
          <p className="py-3 text-xs text-muted">No candidates tagged yet.</p>
        )}
        {employer.candidates.map((c) => (
          <div key={c.tagId} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <Link href={`/boards/${c.boardId}`} className="text-sm font-medium text-ink hover:text-teal">
                {c.name}
              </Link>
              <p className="text-xs text-muted">{c.board}</p>
            </div>
            {readOnly ? (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ background: TAG_STAGE_META[c.stage as TagStage]?.color ?? "#9AA4B2" }}
              >
                {TAG_STAGE_META[c.stage as TagStage]?.label ?? c.stage}
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <select
                  value={c.stage}
                  onChange={(e) => start(() => void setTagStage(c.boardId, c.tagId, e.target.value))}
                  className="rounded-md border border-hair px-1.5 py-1 text-xs outline-none focus:border-teal"
                >
                  {TAG_STAGES.map((s) => (
                    <option key={s} value={s}>{TAG_STAGE_META[s].label}</option>
                  ))}
                </select>
                <button
                  onClick={() => start(() => void untagCandidate(c.boardId, c.tagId))}
                  className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-danger/10 hover:text-danger"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const [, start] = useTransition();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <form
        action={(fd) => {
          start(() => void createEmployer(fd));
          onClose();
        }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-hair bg-white p-5 shadow-pop"
      >
        <h2 className="text-lg font-bold text-ink">Add employer</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Employer name">
            <input name="name" required className={inp} placeholder="e.g. McDonald's" />
          </Field>
          <Field label="Contact email">
            <input name="contactEmail" type="email" className={inp} placeholder="hr@employer.com" />
          </Field>
          <Field label="Contact phone">
            <input name="contactPhone" className={inp} placeholder="+61 ..." />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep">
            Add employer
          </button>
        </div>
      </form>
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
