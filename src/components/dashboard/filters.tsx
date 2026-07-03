"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function DashboardFilters({
  month,
  person,
  program,
  people,
  programs,
}: {
  month: string;
  person: string;
  program: string;
  people: { id: string; name: string }[];
  programs: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  }

  const active = month !== "all" || person !== "all" || program !== "all";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-muted">Filter:</span>

      <Select value={month} onChange={(v) => setParam("month", v)}>
        <option value="all">All time</option>
        <option value="this">This month</option>
        <option value="last">Last month</option>
      </Select>

      <Select value={person} onChange={(v) => setParam("person", v)}>
        <option value="all">All people</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>

      <Select value={program} onChange={(v) => setParam("program", v)}>
        <option value="all">All statuses / programs</option>
        {programs.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </Select>

      {active && (
        <button
          onClick={() => router.push(pathname)}
          className="rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-danger"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-hair bg-white px-2.5 py-1.5 text-sm text-body outline-none focus:border-teal"
    >
      {children}
    </select>
  );
}
