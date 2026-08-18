"use client";

import Link from "next/link";
import type { SentimentRow } from "@/app/actions/vibe";

const SENTIMENT_META: Record<string, { label: string; className: string }> = {
  positive: { label: "Positive", className: "bg-grass/10 text-grass" },
  neutral: { label: "Neutral", className: "bg-canvas text-muted" },
  negative: { label: "Negative", className: "bg-danger/10 text-danger" },
  mixed: { label: "Mixed", className: "bg-amber/10 text-amber" },
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function VibeDashboard({ configured, flagged }: { configured: boolean; flagged: SentimentRow[] }) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">AI Hub</p>
        <h1 className="text-lg font-bold text-ink">Vibe</h1>
      </header>

      <div className="flex-1 overflow-auto scroll-thin p-4 sm:p-6">
        {!configured && (
          <div className="mb-4 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
            Vibe isn&rsquo;t configured yet — add <code className="font-mono">ANTHROPIC_API_KEY</code> in Settings
            to enable sentiment analysis.
          </div>
        )}

        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-hair bg-white p-6 shadow-soft">
            <p className="text-3xl">💬</p>
            <h2 className="mt-2 text-lg font-bold text-ink">Tone &amp; sentiment, surfaced automatically</h2>
            <p className="mt-1 text-sm text-muted">
              Open any item and click &ldquo;Analyze sentiment&rdquo; to score its recent updates and emails.
              Items flagged as negative or needing follow-up show up here.
            </p>
          </div>

          <div className="mt-6">
            <h3 className="mb-2 text-sm font-bold text-ink">Flagged for follow-up</h3>
            {flagged.length === 0 ? (
              <div className="rounded-xl border border-dashed border-hair bg-white p-8 text-center text-sm text-muted">
                Nothing flagged yet — analyze an item from its page to get started.
              </div>
            ) : (
              <div className="grid gap-2">
                {flagged.map((f) => {
                  const meta = SENTIMENT_META[f.sentiment] ?? SENTIMENT_META.neutral;
                  return (
                    <Link
                      key={f.id}
                      href={`/boards/${f.boardId}?item=${f.itemId}`}
                      className="flex items-center gap-3 rounded-xl border border-hair bg-white p-3 shadow-soft hover:border-teal"
                    >
                      <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{f.itemName}</p>
                        <p className="truncate text-xs text-muted">{f.summary || "—"}</p>
                      </div>
                      <span className="flex-none text-[11px] text-muted">{f.boardName} · {timeAgo(f.createdAt)}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
