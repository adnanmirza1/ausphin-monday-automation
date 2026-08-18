"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  previewAiWorkflow,
  saveAiWorkflow,
  type BoardOption,
  type PreviewedWorkflow,
} from "@/app/actions/ai-workflows";

type Category = "All" | "Sales & CRM" | "Support" | "Marketing" | "Productivity" | "HR";
const CATEGORIES: Category[] = ["All", "Sales & CRM", "Support", "Marketing", "Productivity", "HR"];

type WorkflowTemplate = {
  id: string;
  title: string;
  description: string;
  category: Exclude<Category, "All">;
  prompt: string;
};

// Starter cards — each is just a canned prompt that runs through the same
// real parseWorkflowPrompt() path as anything the user types themselves, so
// "template" here means "prompt shortcut," not a separately-maintained
// fake/mocked workflow definition.
const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "meeting-summarizer",
    title: "Meeting summarizer",
    description: "When an item is created, notify the team with a summary request.",
    category: "Productivity",
    prompt: "When a new item is created, notify my department to prepare a meeting summary for it.",
  },
  {
    id: "feedback-sentiment",
    title: "Feedback sentiment",
    description: "When a status changes to Reviewed, generate a follow-up document.",
    category: "Support",
    prompt: "When the status changes to Reviewed, generate the feedback summary document for this item.",
  },
  {
    id: "tickets-routing",
    title: "Tickets routing",
    description: "When a new ticket item is created, assign it round-robin to the support team.",
    category: "Support",
    prompt: "When a new item is created, assign it round robin to the support department.",
  },
  {
    id: "new-lead-notify",
    title: "New lead notification",
    description: "When a new item is created, notify sales immediately.",
    category: "Sales & CRM",
    prompt: "When a new item is created, notify the sales department that a new lead came in.",
  },
  {
    id: "deal-won",
    title: "Deal won → move to Closed",
    description: "When status changes to Won, move the item to the Closed group.",
    category: "Sales & CRM",
    prompt: "When the status changes to Won, move the item to the Closed group.",
  },
  {
    id: "campaign-launch",
    title: "Campaign launch checklist",
    description: "When an item is created, set the launch date to 7 days from now.",
    category: "Marketing",
    prompt: "When a new item is created, set the due date to 7 days from today.",
  },
  {
    id: "onboarding-plan",
    title: "New hire onboarding",
    description: "When a new employee is added, generate their onboarding document.",
    category: "HR",
    prompt: "When a new employee item is created, generate the onboarding plan document for them.",
  },
  {
    id: "candidate-followup",
    title: "Candidate email follow-up",
    description: "When status changes to Interviewed, email the candidate a thank-you note.",
    category: "HR",
    prompt: "When the status changes to Interviewed, send the candidate a thank-you email.",
  },
];

export function AiWorkflowsDashboard({ configured, boards }: { configured: boolean; boards: BoardOption[] }) {
  const router = useRouter();
  const [category, setCategory] = useState<Category>("All");
  const [prompt, setPrompt] = useState("");
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState("");

  const shown = category === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.category === category);

  function openBuilder(p: string) {
    setInitialPrompt(p);
    setBuilderOpen(true);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">AI Hub</p>
        <h1 className="text-lg font-bold text-ink">AI Workflows</h1>
      </header>

      <div className="flex-1 overflow-auto scroll-thin p-4 sm:p-6">
        {!configured && (
          <div className="mb-4 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
            AI Workflows isn&rsquo;t configured yet — add <code className="font-mono">ANTHROPIC_API_KEY</code> in
            Settings to enable prompt-to-workflow building. Templates below still work once it&rsquo;s set.
          </div>
        )}

        {boards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hair bg-white p-8 text-center text-sm text-muted">
            You need at least one board to build a workflow on.
          </div>
        ) : (
          <>
            {/* Prompt box */}
            <div className="mx-auto max-w-2xl rounded-2xl border border-hair bg-white p-6 text-center shadow-soft">
              <p className="text-3xl">✦</p>
              <h2 className="mt-2 text-lg font-bold text-ink">
                Describe any work process and watch it become a workflow in seconds
              </h2>
              <div className="mt-4 grid gap-2 text-left">
                <label className="text-xs font-semibold text-body">Board</label>
                <select
                  value={boardId}
                  onChange={(e) => setBoardId(e.target.value)}
                  className="rounded-lg border border-hair bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal"
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>{b.environmentName} / {b.name}</option>
                  ))}
                </select>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="e.g. When a new employee is added, create an onboarding plan"
                  className="rounded-lg border border-hair bg-white px-3 py-2 text-sm outline-none focus:border-teal"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => prompt.trim() && openBuilder(prompt)}
                  disabled={!prompt.trim() || !configured}
                  className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
                >
                  Build workflow
                </button>
                <button
                  onClick={() => openBuilder("")}
                  className="rounded-lg border border-hair px-4 py-2 text-sm font-semibold text-body hover:bg-canvas"
                >
                  Start from scratch
                </button>
              </div>
            </div>

            {/* Templates grid */}
            <div className="mx-auto mt-8 max-w-4xl">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      category === c ? "bg-teal text-white" : "bg-white text-body hover:bg-canvas"
                    } border border-hair`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openBuilder(t.prompt)}
                    disabled={!configured}
                    className="rounded-xl border border-hair bg-white p-4 text-left shadow-soft hover:border-teal disabled:opacity-50"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-deep">{t.category}</p>
                    <h3 className="mt-1 text-sm font-bold text-ink">{t.title}</h3>
                    <p className="mt-1 text-xs text-muted">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {builderOpen && boardId && (
        <WorkflowBuilderModal
          boardId={boardId}
          boardLabel={boards.find((b) => b.id === boardId)?.name ?? ""}
          initialPrompt={initialPrompt}
          onClose={() => setBuilderOpen(false)}
          onSaved={() => {
            setBuilderOpen(false);
            router.push(`/boards/${boardId}/automations`);
          }}
        />
      )}
    </div>
  );
}

function WorkflowBuilderModal({
  boardId,
  boardLabel,
  initialPrompt,
  onClose,
  onSaved,
}: {
  boardId: string;
  boardLabel: string;
  initialPrompt: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [preview, setPreview] = useState<PreviewedWorkflow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function build() {
    setError(null);
    setPreview(null);
    start(async () => {
      const res = await previewAiWorkflow(boardId, prompt);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res.workflow);
    });
  }

  function save() {
    if (!preview) return;
    start(async () => {
      await saveAiWorkflow(boardId, preview);
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <h2 className="text-lg font-bold text-ink">Build workflow</h2>
        <p className="mt-0.5 text-sm text-muted">on board “{boardLabel}”</p>

        <div className="mt-4 grid gap-3 overflow-y-auto scroll-thin pr-0.5">
          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Describe the workflow — e.g. When a new employee is added, create an onboarding plan"
            className="rounded-lg border border-hair bg-white px-3 py-2 text-sm outline-none focus:border-teal"
          />
          <button
            onClick={build}
            disabled={!prompt.trim() || pending}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            {pending && !preview ? "Building…" : "Build workflow"}
          </button>

          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

          {preview && (
            <div className="rounded-xl border border-hair bg-canvas/50 p-3">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-teal-deep">Preview</p>
              <p className="text-sm font-semibold text-ink">{preview.name}</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-2 text-[11px] text-body">
{JSON.stringify({ trigger: preview.trigger, action: preview.action }, null, 2)}
              </pre>
              <p className="mt-2 text-[11px] text-muted">
                This will be saved as a real automation on this board — you can edit or delete it afterward in
                the board&rsquo;s Automations tab.
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!preview || pending}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            Save workflow
          </button>
        </div>
      </div>
    </div>
  );
}
