"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  restoreEnvironment,
  deleteEnvironment,
} from "@/app/actions/environment";
import { restoreBoard, deleteBoard } from "@/app/actions/board";

type ArchivedEnv = { id: string; name: string; color: string; archivedAt: string };
type ArchivedBoard = {
  id: string;
  name: string;
  archivedAt: string;
  environment: { id: string; name: string };
};

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function TrashPanel({
  environments,
  boards,
}: {
  environments: ArchivedEnv[];
  boards: ArchivedBoard[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const refresh = () => router.refresh();
  const empty = environments.length === 0 && boards.length === 0;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Archive / Trash</h1>
        <p className="mt-1 text-sm text-muted">
          Archived workspaces and boards live here. Restore them anytime, or delete permanently
          (this cascades to all their data and cannot be undone).
        </p>
      </header>

      {empty && (
        <div className="rounded-xl border border-dashed border-hair p-10 text-center text-sm text-muted">
          Nothing archived. Use a workspace’s ⋯ menu or a board’s ⋯ menu to archive it.
        </div>
      )}

      {environments.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Workspaces ({environments.length})
          </h2>
          <div className="flex flex-col gap-2">
            {environments.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-xl border border-hair bg-white p-3 shadow-soft"
              >
                <span className="h-3 w-3 flex-none rounded-sm" style={{ background: e.color }} />
                <div className="flex-1">
                  <p className="font-medium text-ink">{e.name}</p>
                  <p className="text-xs text-muted">Archived {when(e.archivedAt)}</p>
                </div>
                <button
                  onClick={() => start(async () => { await restoreEnvironment(e.id); refresh(); })}
                  className="rounded-lg border border-hair px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas"
                >
                  Restore
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Permanently delete workspace "${e.name}" and ALL its boards & data? This cannot be undone.`))
                      start(async () => { await deleteEnvironment(e.id); refresh(); });
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10"
                >
                  Delete forever
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {boards.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Boards ({boards.length})
          </h2>
          <div className="flex flex-col gap-2">
            {boards.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-xl border border-hair bg-white p-3 shadow-soft"
              >
                <span className="font-mono text-xs text-muted">▦</span>
                <div className="flex-1">
                  <p className="font-medium text-ink">{b.name}</p>
                  <p className="text-xs text-muted">
                    in {b.environment.name} · Archived {when(b.archivedAt)}
                  </p>
                </div>
                <button
                  onClick={() => start(async () => { await restoreBoard(b.id); refresh(); })}
                  className="rounded-lg border border-hair px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas"
                >
                  Restore
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Permanently delete board "${b.name}" and ALL its data? This cannot be undone.`))
                      start(async () => { await deleteBoard(b.id); refresh(); });
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10"
                >
                  Delete forever
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
