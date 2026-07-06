"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logoutAction } from "@/app/actions/auth";
import { addBoard, sortBoards } from "@/app/actions/board";
import {
  createEnvironment,
  renameEnvironment,
  archiveEnvironment,
  setEnvironmentColor,
} from "@/app/actions/environment";
import { PALETTE } from "@/lib/constants";

export type NavEnv = {
  id: string;
  name: string;
  color: string;
  boards: { id: string; name: string }[];
};

export type SidebarUser = {
  name: string;
  email: string;
  avatarColor: string;
  role: string;
  canManageUsers: boolean;
  canManageBoards: boolean;
  canManageEnvironments: boolean;
};

export function Sidebar({
  nav,
  user,
  onNavigate,
}: {
  nav: NavEnv[];
  user: SidebarUser;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(nav.map((e) => [e.id, true]))
  );

  const initials = user.name.split(" ").map((s) => s[0]).slice(0, 2).join("");

  return (
    <aside className="flex h-full w-64 flex-none flex-col bg-rail text-white/90">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-teal text-sm font-bold text-white">
          O
        </span>
        <span className="font-semibold text-white">Oswin Work OS</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scroll-thin px-2 py-3">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={`mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
            pathname === "/dashboard"
              ? "bg-teal/20 font-medium text-white"
              : "text-white/70 hover:bg-rail-hover"
          }`}
        >
          <span className="font-mono text-xs">▦</span> Dashboard
        </Link>
        <Link
          href="/finance"
          onClick={onNavigate}
          className={`mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
            pathname === "/finance"
              ? "bg-teal/20 font-medium text-white"
              : "text-white/70 hover:bg-rail-hover"
          }`}
        >
          <span className="font-mono text-xs">$</span> Finance
        </Link>
        <Link
          href="/employers"
          onClick={onNavigate}
          className={`mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
            pathname === "/employers"
              ? "bg-teal/20 font-medium text-white"
              : "text-white/70 hover:bg-rail-hover"
          }`}
        >
          <span className="font-mono text-xs">◈</span> Employers
        </Link>

        <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-white/35">
          Workspaces
        </p>
        {nav.map((env) => (
          <div key={env.id} className="mb-1">
            <div className="group flex items-center rounded-md pr-1 hover:bg-rail-hover">
              <button
                onClick={() => setOpen((o) => ({ ...o, [env.id]: !o[env.id] }))}
                className="flex flex-1 items-center gap-2 px-2 py-1.5 text-sm font-medium"
              >
                <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: env.color }} />
                <span className="flex-1 truncate text-left">{env.name}</span>
                <span className="text-xs text-white/40">{open[env.id] ? "▾" : "▸"}</span>
              </button>
              {user.canManageEnvironments && <EnvMenu env={env} />}
            </div>

            {open[env.id] && (
              <div className="ml-3 mt-0.5 border-l border-white/10 pl-2">
                {env.boards.map((b) => {
                  const active = pathname === `/boards/${b.id}`;
                  return (
                    <Link
                      key={b.id}
                      href={`/boards/${b.id}`}
                      onClick={onNavigate}
                      className={`block truncate rounded-md px-2 py-1.5 text-sm ${
                        active
                          ? "bg-teal/20 font-medium text-white"
                          : "text-white/70 hover:bg-rail-hover"
                      }`}
                    >
                      {b.name}
                    </Link>
                  );
                })}
                {env.boards.length === 0 && (
                  <p className="px-2 py-1 text-xs text-white/35">No boards</p>
                )}
                {user.canManageBoards && (
                  <AddBoard environmentId={env.id} onCreated={onNavigate} />
                )}
              </div>
            )}
          </div>
        ))}

        {user.canManageEnvironments && <AddWorkspace onCreated={onNavigate} />}
      </nav>

      {/* Admin + user */}
      <div className="border-t border-white/10 p-2">
        {user.canManageUsers && (
          <Link
            href="/admin"
            onClick={onNavigate}
            className={`mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
              pathname.startsWith("/admin")
                ? "bg-teal/20 font-medium text-white"
                : "text-white/70 hover:bg-rail-hover"
            }`}
          >
            <span className="font-mono text-xs">⚙</span> Admin Panel
          </Link>
        )}
        {user.canManageUsers && (
          <Link
            href="/settings"
            onClick={onNavigate}
            className={`mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
              pathname.startsWith("/settings")
                ? "bg-teal/20 font-medium text-white"
                : "text-white/70 hover:bg-rail-hover"
            }`}
          >
            <span className="font-mono text-xs">⚡</span> Integrations
          </Link>
        )}
        {user.canManageEnvironments && (
          <Link
            href="/trash"
            onClick={onNavigate}
            className={`mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
              pathname.startsWith("/trash")
                ? "bg-teal/20 font-medium text-white"
                : "text-white/70 hover:bg-rail-hover"
            }`}
          >
            <span className="font-mono text-xs">🗄</span> Archive / Trash
          </Link>
        )}

        <div className="mt-1 flex items-center gap-2 rounded-md px-2 py-2">
          <span
            className="grid h-8 w-8 flex-none place-items-center rounded-full text-xs font-bold text-white"
            style={{ background: user.avatarColor }}
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-white/40">{user.role}</p>
          </div>
          <form action={logoutAction}>
            <button
              className="rounded-md px-2 py-1 text-xs text-white/50 hover:bg-rail-hover hover:text-white"
              title="Sign out"
            >
              ⏻
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-rail-hover ${
        danger ? "text-red-300" : "text-white/85"
      }`}
    >
      <span className="w-4 flex-none text-center text-white/50">{icon}</span>
      {label}
    </button>
  );
}

function EnvMenu({ env }: { env: NavEnv }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(env.name);
  const [, start] = useTransition();

  if (renaming) {
    return (
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          setRenaming(false);
          if (name.trim() && name !== env.name) start(() => void renameEnvironment(env.id, name));
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="w-28 rounded border border-white/20 bg-rail-hover px-1.5 py-0.5 text-sm text-white outline-none"
      />
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="hidden h-6 w-6 place-items-center rounded text-white/40 hover:bg-rail-hover hover:text-white group-hover:grid"
        title="Manage workspace"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-56 rounded-lg border border-white/10 bg-rail p-1 shadow-pop">
            <p className="truncate px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-white/35">
              {env.name}
            </p>

            {/* Edit */}
            <MenuRow icon="✎" label="Rename workspace" onClick={() => { setOpen(false); setRenaming(true); }} />

            {/* Organize */}
            <MenuRow
              icon="↕"
              label="Sort boards A–Z"
              onClick={() => { setOpen(false); start(() => void sortBoards(env.id)); }}
            />

            <div className="my-1 border-t border-white/10" />

            {/* Create */}
            <MenuRow
              icon="＋"
              label="Add board"
              onClick={() => {
                setOpen(false);
                const n = window.prompt("New board name:");
                if (n && n.trim())
                  start(async () => {
                    const id = await addBoard(env.id, n.trim());
                    if (id) router.push(`/boards/${id}`);
                  });
              }}
            />
            <MenuRow
              icon="⊞"
              label="Add new workspace"
              onClick={() => {
                setOpen(false);
                const n = window.prompt("New workspace name:");
                if (n && n.trim()) start(() => void createEnvironment(n.trim()));
              }}
            />

            <div className="my-1 border-t border-white/10" />

            {/* Color */}
            <p className="px-2 pb-1 pt-0.5 text-[11px] text-white/40">Workspace color</p>
            <div className="flex flex-wrap gap-1 px-2 pb-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => { setOpen(false); start(() => void setEnvironmentColor(env.id, c)); }}
                  className={`h-4 w-4 rounded ring-offset-1 ring-offset-rail hover:ring-2 hover:ring-white/40 ${
                    env.color === c ? "ring-2 ring-white" : ""
                  }`}
                  style={{ background: c }}
                  title="Set color"
                />
              ))}
            </div>

            <div className="my-1 border-t border-white/10" />

            {/* Archive / Trash */}
            <MenuRow
              icon="🗄"
              label="View archive/trash"
              onClick={() => { setOpen(false); router.push("/trash"); }}
            />
            <MenuRow
              icon="🗑"
              label="Archive workspace"
              danger
              onClick={() => {
                setOpen(false);
                if (confirm(`Archive workspace "${env.name}"? You can restore it from Archive/Trash.`))
                  start(() => void archiveEnvironment(env.id));
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function AddWorkspace({ onCreated }: { onCreated?: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [, start] = useTransition();

  if (!adding)
    return (
      <button
        onClick={() => setAdding(true)}
        className="mt-1 block w-full rounded-md px-2 py-1.5 text-left text-sm text-white/45 hover:bg-rail-hover hover:text-white/80"
      >
        + Add workspace
      </button>
    );

  return (
    <input
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => {
        setAdding(false);
        if (name.trim()) start(() => void createEnvironment(name));
        setName("");
        onCreated?.();
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder="Workspace name…"
      className="mt-1 w-full rounded-md border border-white/20 bg-rail-hover px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-teal"
    />
  );
}

function AddBoard({
  environmentId,
  onCreated,
}: {
  environmentId: string;
  onCreated?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!adding)
    return (
      <button
        onClick={() => setAdding(true)}
        className="mt-0.5 block w-full rounded-md px-2 py-1.5 text-left text-sm text-white/45 hover:bg-rail-hover hover:text-white/80"
      >
        + Add board
      </button>
    );

  function submit() {
    const n = name.trim();
    setAdding(false);
    setName("");
    if (!n) return;
    start(async () => {
      const id = await addBoard(environmentId, n);
      onCreated?.();
      if (id) router.push(`/boards/${id}`);
    });
  }

  return (
    <input
      autoFocus
      value={name}
      disabled={pending}
      onChange={(e) => setName(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder="Board name…"
      className="mt-0.5 w-full rounded-md border border-white/20 bg-rail-hover px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-teal"
    />
  );
}
