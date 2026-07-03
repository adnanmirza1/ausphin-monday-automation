import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { allowedBoardIds } from "@/lib/guard";
import { db } from "@/lib/db";
import type { StatusLabel } from "@/lib/constants";
import { DashboardFilters } from "@/components/dashboard/filters";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; person?: string; program?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgId = user.orgId;
  const sp = await searchParams;
  const month = sp.month ?? "all"; // all | this | last
  const personFilter = sp.person ?? "all";
  const programFilter = sp.program ?? "all";

  const allowed = allowedBoardIds(user);
  const boardWhere = allowed ? { id: { in: allowed } } : {};

  // Environments/boards (for names + workspace chart).
  const envsRaw = await db.environment.findMany({
    where: { orgId },
    include: { boards: { where: boardWhere, select: { id: true, name: true } } },
  });
  const envs = envsRaw;
  const boardName = new Map<string, string>();
  envs.forEach((e) => e.boards.forEach((b) => boardName.set(b.id, b.name)));

  // Status columns → value→label map (per column).
  const statusColumns = await db.column.findMany({
    where: {
      type: "status",
      board: { environment: { orgId }, ...(allowed ? { id: { in: allowed } } : {}) },
    },
    select: { id: true, config: true },
  });
  const valueLabel = new Map<string, StatusLabel>(); // key: `${columnId}:${valueId}`
  const allLabels = new Map<string, string>(); // label text → color (for program filter options)
  for (const c of statusColumns) {
    try {
      const labels: StatusLabel[] = JSON.parse(c.config).labels ?? [];
      for (const l of labels) {
        valueLabel.set(`${c.id}:${l.id}`, l);
        allLabels.set(l.label, l.color);
      }
    } catch {}
  }

  // All items in the org with cells (person + status columns).
  const items = await db.item.findMany({
    where: { board: { environment: { orgId }, ...(allowed ? { id: { in: allowed } } : {}) } },
    include: { cells: { include: { person: true, column: true } } },
  });

  // Month range.
  const now = new Date();
  const range = monthRange(month, now);

  const labelOf = (columnId: string, value: string | null) =>
    value ? valueLabel.get(`${columnId}:${value}`)?.label ?? null : null;

  // Apply filters.
  const filtered = items.filter((it) => {
    if (range && (it.createdAt < range.start || it.createdAt >= range.end)) return false;
    if (personFilter !== "all" && !it.cells.some((c) => c.personId === personFilter))
      return false;
    if (
      programFilter !== "all" &&
      !it.cells.some((c) => c.column.type === "status" && labelOf(c.columnId, c.value) === programFilter)
    )
      return false;
    return true;
  });

  // Aggregates.
  const totalItems = filtered.length;
  let doneCount = 0;
  const statusAgg = new Map<string, { label: string; color: string; count: number }>();
  const perBoard = new Map<string, number>();
  const ownerAgg = new Map<string, { name: string; color: string; count: number }>();

  for (const it of filtered) {
    perBoard.set(it.boardId, (perBoard.get(it.boardId) ?? 0) + 1);
    for (const c of it.cells) {
      if (c.column.type === "status") {
        const l = valueLabel.get(`${c.columnId}:${c.value}`);
        if (l) {
          const key = l.label.toLowerCase();
          const cur = statusAgg.get(key) ?? { label: l.label, color: l.color, count: 0 };
          cur.count++;
          statusAgg.set(key, cur);
          if (l.label.toLowerCase() === "done") doneCount++;
        }
      }
      if (c.personId && c.person) {
        const cur = ownerAgg.get(c.personId) ?? {
          name: c.person.name,
          color: c.person.avatarColor,
          count: 0,
        };
        cur.count++;
        ownerAgg.set(c.personId, cur);
      }
    }
  }

  const statusData = [...statusAgg.values()].sort((a, b) => b.count - a.count);
  const boardData = [...perBoard.entries()]
    .map(([id, n]) => ({ label: boardName.get(id) ?? "—", value: n, color: "#5B7A99" }))
    .sort((a, b) => b.value - a.value);
  const ownerData = [...ownerAgg.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((o) => ({ label: o.name, value: o.count, color: o.color }));

  // Filter options.
  const people = await db.user.findMany({
    where: { orgId, status: { not: "inactive" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const programs = [...allLabels.keys()].sort();

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Reporting</p>
        <h1 className="text-lg font-bold text-ink">Company Dashboard</h1>
      </header>

      <div className="flex-1 overflow-auto scroll-thin p-4 sm:p-6">
        <DashboardFilters
          month={month}
          person={personFilter}
          program={programFilter}
          people={people}
          programs={programs}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Boards" value={boardName.size} accent="#5B7A99" />
          <Kpi label="Items" value={totalItems} accent="#0B7A6F" />
          <Kpi label="Done" value={doneCount} accent="#2E9C63" />
          <Kpi label="People" value={ownerData.length} accent="#C67A1E" />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title="Status distribution" subtitle="Across filtered items">
            {statusData.length === 0 ? <Empty /> : <BarList data={statusData.map((s) => ({ label: s.label, value: s.count, color: s.color }))} />}
          </Card>
          <Card title="Items per board" subtitle="Workload by board">
            {boardData.length === 0 ? <Empty /> : <BarList data={boardData} />}
          </Card>
          <Card title="Top owners" subtitle="Assigned items by person">
            {ownerData.length === 0 ? <Empty /> : <BarList data={ownerData} />}
          </Card>
          <Card title="Workspaces" subtitle="Boards per environment">
            <BarList data={envs.map((e) => ({ label: e.name, value: e.boards.length, color: "#0B7A6F" }))} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function monthRange(month: string, now: Date): { start: Date; end: Date } | null {
  if (month === "this") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  if (month === "last") {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 1),
    };
  }
  return null;
}

function Kpi({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-hair bg-white p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className="mt-1.5 text-3xl font-extrabold tracking-tight text-ink tabular-nums">{value}</p>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hair bg-white p-4 shadow-soft">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function BarList({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-28 flex-none truncate text-xs text-body">{d.label}</span>
          <div className="h-5 flex-1 overflow-hidden rounded-md bg-canvas">
            <div
              className="flex h-full items-center justify-end rounded-md px-2 text-[10px] font-bold text-white"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color, minWidth: 22 }}
            >
              {d.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return <p className="py-6 text-center text-sm text-muted">No data for this filter</p>;
}
