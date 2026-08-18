"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Sparkles,
  Heart,
  GitFork,
  Bot,
  AudioLines,
  Zap,
  LayoutGrid,
  DollarSign,
  Building2,
  Settings,
  Archive,
  Power,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { addBoard, sortBoards } from "@/app/actions/board";
import {
  createEnvironment,
  renameEnvironment,
  archiveEnvironment,
  setEnvironmentColor,
} from "@/app/actions/environment";
import { PALETTE } from "@/lib/constants";
import { ThemeToggle } from "@/components/theme-toggle";
import { DropdownMenu } from "@/components/ui/popover";

const AI_HUB_ITEMS = [
  { href: "/ai/sidekick", label: "AI Sidekick", icon: Sparkles, iconClassName: "text-cyan-400" },
  { href: "/ai/vibe", label: "Vibe", icon: Heart, iconClassName: "text-pink-500 fill-pink-500" },
  { href: "/ai/workflows", label: "AI Workflows", icon: GitFork, iconClassName: "text-blue-400" },
  { href: "/ai/agents", label: "AI Agents", icon: Bot, iconClassName: "text-cyan-400" },
  { href: "/ai/notetaker", label: "AI Notetaker", icon: AudioLines, iconClassName: "text-violet-400" },
] as const;

// Shared icon sizing/alignment so every nav row lines up identically.
const NAV_ICON_CLASS = "h-[18px] w-[18px] flex-none";
const NAV_ROW_CLASS = "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors";
const NAV_ACTIVE_CLASS = "bg-white/10 text-white";
const NAV_MUTED_CLASS = "text-slate-400 hover:bg-white/5 hover:text-slate-200";

function NavIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return <Icon className={`${NAV_ICON_CLASS} ${className ?? ""}`} />;
}

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
  avatarUrl?: string | null;
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
  const [aiOpen, setAiOpen] = useState(pathname.startsWith("/ai"));

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
          className={`mb-2 ${NAV_ROW_CLASS} ${pathname === "/dashboard" ? NAV_ACTIVE_CLASS : NAV_MUTED_CLASS}`}
        >
          <NavIcon icon={LayoutGrid} className="text-indigo-400" /> Dashboard
        </Link>
        <Link
          href="/finance"
          onClick={onNavigate}
          className={`mb-2 ${NAV_ROW_CLASS} ${pathname === "/finance" ? NAV_ACTIVE_CLASS : NAV_MUTED_CLASS}`}
        >
          <NavIcon icon={DollarSign} className="text-emerald-400" /> Finance
        </Link>
        <Link
          href="/employers"
          onClick={onNavigate}
          className={`mb-2 ${NAV_ROW_CLASS} ${pathname === "/employers" ? NAV_ACTIVE_CLASS : NAV_MUTED_CLASS}`}
        >
          <NavIcon icon={Building2} className="text-orange-400" /> Employers
        </Link>

        <div className="mb-2">
          <button
            onClick={() => setAiOpen((v) => !v)}
            className={`w-full ${NAV_ROW_CLASS} ${pathname.startsWith("/ai") ? NAV_ACTIVE_CLASS : NAV_MUTED_CLASS}`}
          >
            <NavIcon icon={Sparkles} className="text-cyan-400" />
            <span className="flex-1 text-left">AI Hub</span>
            <span className="flex-none text-xs text-white/40">{aiOpen ? "▾" : "▸"}</span>
          </button>
          {aiOpen && (
            <div className="ml-3 mt-0.5 border-l border-white/10 pl-2">
              {AI_HUB_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`truncate ${NAV_ROW_CLASS} ${active ? NAV_ACTIVE_CLASS : NAV_MUTED_CLASS}`}
                  >
                    <NavIcon icon={item.icon} className={item.iconClassName} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-white/35">
          Workspaces
        </p>
        {nav.map((env) => (
          <div key={env.id} className="mb-1">
            <div className="group flex items-center rounded-md pr-1 hover:bg-rail-hover">
              <button
                onClick={() => setOpen((o) => ({ ...o, [env.id]: !o[env.id] }))}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm font-medium"
              >
                <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: env.color }} />
                <span className="min-w-0 flex-1 truncate text-left">{env.name}</span>
                <span className="flex-none text-xs text-white/40">{open[env.id] ? "▾" : "▸"}</span>
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
            className={`mb-1 ${NAV_ROW_CLASS} ${pathname.startsWith("/admin") ? NAV_ACTIVE_CLASS : NAV_MUTED_CLASS}`}
          >
            <NavIcon icon={Settings} className="text-slate-400" /> Admin Panel
          </Link>
        )}
        {user.canManageUsers && (
          <Link
            href="/settings"
            onClick={onNavigate}
            className={`mb-1 ${NAV_ROW_CLASS} ${pathname.startsWith("/settings") ? NAV_ACTIVE_CLASS : NAV_MUTED_CLASS}`}
          >
            <NavIcon icon={Zap} className="text-amber-400" /> Integrations
          </Link>
        )}
        {user.canManageEnvironments && (
          <Link
            href="/trash"
            onClick={onNavigate}
            className={`mb-1 ${NAV_ROW_CLASS} ${pathname.startsWith("/trash") ? NAV_ACTIVE_CLASS : NAV_MUTED_CLASS}`}
          >
            <NavIcon icon={Archive} className="text-slate-400" /> Archive / Trash
          </Link>
        )}

        <ThemeToggle />

        <div className="mt-1 flex items-center gap-2 rounded-md px-2 py-2">
          <span
            className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full text-xs font-bold text-white"
            style={{ background: user.avatarColor }}
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-white/40">{user.role}</p>
          </div>
          <form action={logoutAction}>
            <button
              className="grid h-7 w-7 place-items-center rounded-md text-white/50 hover:bg-rail-hover hover:text-white"
              title="Sign out"
            >
              <Power className="h-[18px] w-[18px]" />
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
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      width={224}
      align="right"
      trigger={(p) => (
        <button
          ref={p.ref}
          onClick={p.onClick}
          aria-expanded={p["aria-expanded"]}
          aria-haspopup={p["aria-haspopup"]}
          className={`h-6 w-6 flex-none place-items-center rounded text-white/40 hover:bg-rail-hover hover:text-white ${
            open ? "grid" : "hidden group-hover:grid"
          }`}
          title="Manage workspace"
        >
          ⋯
        </button>
      )}
      panelClassName="rounded-lg border border-white/10 bg-rail p-1 shadow-pop overflow-y-auto scroll-thin"
    >
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
    </DropdownMenu>
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
