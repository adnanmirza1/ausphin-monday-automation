"use client";

import { useState, useTransition } from "react";
import {
  createTextNoteSession,
  createAudioNoteSession,
  deleteNoteSession,
  type NotetakerSessionRow,
} from "@/app/actions/notetaker";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function NotetakerDashboard({
  status,
  sessions,
}: {
  status: { summarizeConfigured: boolean; audioConfigured: boolean };
  sessions: NotetakerSessionRow[];
}) {
  const [list, setList] = useState(sessions);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submitText() {
    setError(null);
    start(async () => {
      try {
        const row = await createTextNoteSession(title, text);
        setList((l) => [row, ...l]);
        setTitle("");
        setText("");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function submitAudio() {
    if (!audioFile) return;
    setError(null);
    start(async () => {
      try {
        const base64 = await fileToBase64(audioFile);
        const row = await createAudioNoteSession(title, base64, audioFile.name, audioFile.type || "audio/mpeg");
        setList((l) => [row, ...l]);
        setTitle("");
        setAudioFile(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">AI Hub</p>
        <h1 className="text-lg font-bold text-ink">AI Notetaker</h1>
      </header>

      <div className="flex-1 overflow-auto scroll-thin p-4 sm:p-6">
        {!status.summarizeConfigured && (
          <div className="mb-4 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
            Summarization isn&rsquo;t configured — add <code className="font-mono">ANTHROPIC_API_KEY</code> in Settings.
          </div>
        )}

        <div className="mx-auto max-w-2xl rounded-2xl border border-hair bg-white p-6 shadow-soft">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Session title (optional)"
            className="mb-3 w-full rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Paste meeting notes or a transcript…"
            className="w-full rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
          />
          <button
            onClick={submitText}
            disabled={pending || !text.trim() || !status.summarizeConfigured}
            className="mt-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            {pending ? "Summarizing…" : "Summarize notes"}
          </button>

          <div className="my-4 border-t border-hair" />

          <p className="mb-2 text-xs font-semibold text-body">Or upload a recording</p>
          {!status.audioConfigured ? (
            <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
              Audio transcription isn&rsquo;t configured yet — add <code className="font-mono">OPENAI_API_KEY</code> in
              Settings to enable uploading recordings.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                className="flex-1 text-xs text-body"
              />
              <button
                onClick={submitAudio}
                disabled={pending || !audioFile}
                className="flex-none rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
              >
                {pending ? "Processing…" : "Transcribe & summarize"}
              </button>
            </div>
          )}

          {error && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        </div>

        <div className="mx-auto mt-6 max-w-2xl">
          <h3 className="mb-2 text-sm font-bold text-ink">Sessions</h3>
          {list.length === 0 ? (
            <div className="rounded-xl border border-dashed border-hair bg-white p-8 text-center text-sm text-muted">
              No sessions yet.
            </div>
          ) : (
            <div className="grid gap-2">
              {list.map((s) => (
                <div key={s.id} className="rounded-xl border border-hair bg-white p-4 shadow-soft">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">{s.title}</p>
                      <p className="text-[11px] text-muted">{s.sourceKind} · {timeAgo(s.createdAt)}</p>
                    </div>
                    <button
                      onClick={() =>
                        start(async () => {
                          await deleteNoteSession(s.id);
                          setList((l) => l.filter((x) => x.id !== s.id));
                        })
                      }
                      disabled={pending}
                      className="flex-none text-xs text-muted hover:text-danger disabled:opacity-60 disabled:cursor-wait"
                    >
                      Delete
                    </button>
                  </div>
                  {s.status === "done" && (
                    <>
                      <p className="mt-2 text-sm text-body">{s.summary}</p>
                      {s.actionItems.length > 0 && (
                        <ul className="mt-2 grid gap-0.5 text-xs text-body">
                          {s.actionItems.map((a, i) => (
                            <li key={i} className="flex gap-1.5">
                              <span className="text-teal">·</span>
                              {a}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {(s.status === "failed" || s.status === "transcribing") && (
                    <p className={`mt-2 text-xs ${s.status === "failed" ? "text-danger" : "text-muted"}`}>
                      {s.status === "failed" ? s.error : "Transcribing…"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
