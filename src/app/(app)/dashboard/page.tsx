import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { allowedBoardIds } from "@/lib/guard";
import { db } from "@/lib/db";
import type { StatusLabel } from "@/lib/constants";
import { DashboardFilters } from "@/components/dashboard/filters";
import { DashboardCanvas, type DashData } from "@/components/dashboard/dashboard-canvas";

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
  const doneRate = totalItems ? Math.min(100, Math.round((doneCount / totalItems) * 100)) : 0;

  // Filter options.
  const people = await db.user.findMany({
    where: { orgId, status: { not: "inactive" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const programs = [...allLabels.keys()].sort();

  // Data over time — items created per month, last 6 months (respects filters).
  const monthBuckets: { key: string; label: string; value: number }[] = [];
  const nowD = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
    monthBuckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString("en-US", { month: "short" }),
      value: 0,
    });
  }
  const monthIdx = new Map(monthBuckets.map((m, i) => [m.key, i]));
  for (const it of filtered) {
    const d = it.createdAt;
    const idx = monthIdx.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (idx !== undefined) monthBuckets[idx].value++;
  }

  // Activity analytics — updates across org boards over the last 6 weeks.
  const activitySince = new Date(Date.now() - 42 * 86400000);
  const recentUpdates = await db.update.findMany({
    where: {
      createdAt: { gte: activitySince },
      item: { board: { environment: { orgId }, ...(allowed ? { id: { in: allowed } } : {}) } },
    },
    select: { createdAt: true },
  });
  const weekBuckets: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(Date.now() - (i * 7 + 6) * 86400000);
    weekBuckets.push({ label: start.toLocaleString("en-US", { month: "short", day: "numeric" }), value: 0 });
  }
  for (const u of recentUpdates) {
    const daysAgo = Math.floor((Date.now() - u.createdAt.getTime()) / 86400000);
    const wi = 5 - Math.floor(daysAgo / 7);
    if (wi >= 0 && wi < 6) weekBuckets[wi].value++;
  }

  const dashData: DashData = {
    kpis: {
      boards: boardName.size,
      items: totalItems,
      done: doneCount,
      completion: doneRate,
      people: ownerData.length,
    },
    status: statusData,
    boards: boardData,
    owners: ownerData,
    workspaces: envs.map((e) => ({ label: e.name, value: e.boards.length, color: "#0B7A6F" })),
    overTime: monthBuckets.map((m) => ({ label: m.label, value: m.value })),
    activity: { totalUpdates: recentUpdates.length, series: weekBuckets },
  };

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

        <DashboardCanvas data={dashData} />
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
