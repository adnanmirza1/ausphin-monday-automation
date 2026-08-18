"use client";

import { useState, useTransition } from "react";
import {
  createAgent,
  deleteAgent,
  startAgentRun,
  approveAgentStep,
  type AgentRow,
  type AgentRunRow,
} from "@/app/actions/ai-agents";
import type { BoardOption } from "@/app/actions/ai-workflows";

const TOOL_LABELS: Record<string, string> = {
  move_to_group: "Move item to group",
  set_status: "Set a status",
  change_column_value: "Change a column value",
  notify: "Notify a department",
  generate_document: "Generate a document",
  send_email: "Send an email",
};

export function AgentsDashboard({
  configured,
  agents,
  boards,
  toolTypes,
  canManage,
}: {
  configured: boolean;
  agents: AgentRow[];
  boards: BoardOption[];
  toolTypes: string[];
  canManage: boolean;
}) {
  const [list, setList] = useState(agents);
  const [creating, setCreating] = useState(false);
  const [runningAgent, setRunningAgent] = useState<AgentRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, start] = useTransition();

  function refresh(next: AgentRow[]) {
    setList(next);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">AI Hub</p>
            <h1 className="text-lg font-bold text-ink">AI Agents</h1>
          </div>
          {canManage && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep"
            >
              + New agent
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto scroll-thin p-4 sm:p-6">
        {!configured && (
          <div className="mb-4 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
            AI Agents isn&rsquo;t configured yet — add <code className="font-mono">ANTHROPIC_API_KEY</code> in
            Settings to enable planning.
          </div>
        )}

        {list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hair bg-white p-8 text-center text-sm text-muted">
            No agents yet. {canManage ? "Create one to get started." : "Ask an admin to create one."}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((a) => (
              <div key={a.id} className="rounded-xl border border-hair bg-white p-4 shadow-soft">
                <h3 className="text-sm font-bold text-ink">{a.name}</h3>
                <p className="mt-1 text-xs text-muted">{a.goal || "(no goal set)"}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.allowedTools.map((t) => (
                    <span key={t} className="rounded-full bg-canvas px-2 py-0.5 text-[10px] text-body">
                      {TOOL_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  {a.requireApproval ? "Requires approval" : "Runs sensitive steps only with approval"}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setRunningAgent(a)}
                    disabled={!configured || boards.length === 0}
                    className="flex-1 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
                  >
                    Run
                  </button>
                  {canManage && (
                    <button
                      onClick={() => {
                        setDeletingId(a.id);
                        start(async () => {
                          await deleteAgent(a.id);
                          refresh(list.filter((x) => x.id !== a.id));
                          setDeletingId(null);
                        });
                      }}
                      disabled={deletingId === a.id}
                      className="rounded-lg border border-hair px-3 py-1.5 text-xs text-muted hover:bg-canvas disabled:opacity-60 disabled:cursor-wait"
                    >
                      {deletingId === a.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <CreateAgentModal
          toolTypes={toolTypes}
          onClose={() => setCreating(false)}
          onCreated={(a) => {
            setCreating(false);
            refresh([a, ...list]);
          }}
        />
      )}

      {runningAgent && (
        <RunAgentModal
          agent={runningAgent}
          boards={boards}
          onClose={() => setRunningAgent(null)}
        />
      )}
    </div>
  );
}

function CreateAgentModal({
  toolTypes,
  onClose,
  onCreated,
}: {
  toolTypes: string[];
  onClose: () => void;
  onCreated: (a: AgentRow) => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [requireApproval, setRequireApproval] = useState(true);
  const [pending, start] = useTransition();

  function toggle(t: string) {
    setTools((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  }

  function save() {
    if (!name.trim() || tools.length === 0) return;
    start(async () => {
      const created = await createAgent(name, goal, tools, requireApproval);
      onCreated(created);
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md animate-rise rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <h2 className="text-lg font-bold text-ink">New agent</h2>
        <div className="mt-4 grid gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" className="rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal" />
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="Goal — e.g. Keep support tickets triaged and the right people notified" className="rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal" />
          <div>
            <p className="mb-1 text-xs font-semibold text-body">Allowed tools</p>
            <div className="grid gap-1">
              {toolTypes.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm text-body">
                  <input type="checkbox" checked={tools.includes(t)} onChange={() => toggle(t)} />
                  {TOOL_LABELS[t] ?? t}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} />
            Require approval before every step runs
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas disabled:opacity-60">Cancel</button>
          <button
            onClick={save}
            disabled={!name.trim() || tools.length === 0 || pending}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50 disabled:cursor-wait"
          >
            {pending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RunAgentModal({
  agent,
  boards,
  onClose,
}: {
  agent: AgentRow;
  boards: BoardOption[];
  onClose: () => void;
}) {
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [itemId, setItemId] = useState("");
  const [input, setInput] = useState("");
  const [run, setRun] = useState<AgentRunRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function plan() {
    setError(null);
    start(async () => {
      const r = await startAgentRun(agent.id, boardId, input);
      setRun(r);
    });
  }

  function approve(index: number) {
    if (!run || !itemId.trim()) {
      setError("Enter the target item ID first.");
      return;
    }
    start(async () => {
      const r = await approveAgentStep(run.id, index, boardId, itemId.trim());
      setRun(r);
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg animate-rise flex-col rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <h2 className="text-lg font-bold text-ink">Run “{agent.name}”</h2>

        <div className="mt-4 grid gap-3 overflow-y-auto scroll-thin pr-0.5">
          <select value={boardId} onChange={(e) => setBoardId(e.target.value)} className="rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal">
            {boards.map((b) => (
              <option key={b.id} value={b.id}>{b.environmentName} / {b.name}</option>
            ))}
          </select>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} placeholder="What should the agent do?" className="rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal" />
          <button onClick={plan} disabled={pending || !input.trim()} className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50">
            {pending && !run ? "Planning…" : "Plan steps"}
          </button>

          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

          {run && (
            <div className="grid gap-2">
              {run.status === "failed" && run.error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{run.error}</p>}
              {run.steps.length === 0 && run.status !== "failed" && (
                <p className="rounded-lg border border-dashed border-hair px-3 py-2 text-xs text-muted">
                  Nothing to do with this agent&rsquo;s allowed tools for that request.
                </p>
              )}
              {run.steps.length > 0 && (
                <input
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  placeholder="Target item ID (from the board URL/panel)"
                  className="rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
                />
              )}
              {run.steps.map((s, i) => (
                <div key={i} className="rounded-lg border border-hair p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-ink">{s.description}</p>
                    <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      s.status === "done" ? "bg-grass/10 text-grass" : s.status === "failed" ? "bg-danger/10 text-danger" : "bg-canvas text-muted"
                    }`}>
                      {s.status}
                    </span>
                  </div>
                  {(s.result || s.error) && <p className="mt-1 text-xs text-muted">{s.result || s.error}</p>}
                  {s.status === "pending" && (
                    <button onClick={() => approve(i)} disabled={pending} className="mt-2 rounded-lg bg-teal px-3 py-1 text-xs font-semibold text-white hover:bg-teal-deep disabled:opacity-50">
                      Approve &amp; run
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">Close</button>
        </div>
      </div>
    </div>
  );
}
