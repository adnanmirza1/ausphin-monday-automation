"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { PALETTE, USER_STATUSES, USER_STATUS_META } from "@/lib/constants";
import {
  setUserRole,
  setUserDepartment,
  setUserStatus,
  setUserAvatar,
  createUser,
  editUser,
  deleteUser,
  addDepartment,
  deleteDepartment,
  editDepartment,
  addRole,
  editRole,
  deleteRole,
  createInvitation,
  revokeInvitation,
} from "@/app/actions/admin";

type BoardLite = { id: string; name: string };
type Role = {
  id: string;
  name: string;
  color: string;
  isSystem: boolean;
  readOnly: boolean;
  boards: "all" | string[];
};
type Dept = { id: string; name: string; color: string };
type UserRow = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  avatarUrl: string | null;
  status: string;
  roleId: string | null;
  departmentId: string | null;
};
type Invite = { id: string; email: string; status: string; roleId: string | null; token: string };

const TABS = ["Users", "Roles", "Departments", "Invitations"] as const;
type Tab = (typeof TABS)[number];

export function AdminPanel({
  users,
  roles,
  departments,
  invitations,
  boards,
  currentUserId,
}: {
  users: UserRow[];
  roles: Role[];
  departments: Dept[];
  invitations: Invite[];
  boards: BoardLite[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState<Tab>("Users");

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-6 py-3">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Access Control
        </p>
        <h1 className="text-lg font-bold text-ink">Admin Panel</h1>
      </header>

      <div className="border-b border-hair bg-white px-6">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-3 py-2.5 text-sm font-medium ${
                tab === t ? "text-teal" : "text-muted hover:text-body"
              }`}
            >
              {t}
              {tab === t && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-teal" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto scroll-thin p-6">
        {tab === "Users" && (
          <UsersTab users={users} roles={roles} departments={departments} currentUserId={currentUserId} />
        )}
        {tab === "Roles" && <RolesTab roles={roles} boards={boards} />}
        {tab === "Departments" && <DepartmentsTab departments={departments} />}
        {tab === "Invitations" && <InvitesTab invitations={invitations} roles={roles} />}
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("");
}

// Clickable avatar with photo upload (stored as a data URL). Falls back to
// initials on the user's colour when no photo is set.
function AvatarUpload({ user }: { user: UserRow }) {
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1_400_000) {
      alert("Please choose an image under ~1.4 MB.");
      return;
    }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      start(async () => {
        await setUserAvatar(user.id, url);
        setBusy(false);
      });
    };
    reader.onerror = () => setBusy(false);
    reader.readAsDataURL(file);
  }

  return (
    <div className="group/av relative flex-none">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title="Change profile picture"
        className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full text-[11px] font-bold text-white"
        style={{ background: user.avatarColor }}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
        ) : (
          initials(user.name)
        )}
        <span className="absolute inset-0 hidden place-items-center bg-ink/40 text-[9px] group-hover/av:grid">
          {busy ? "…" : "✎"}
        </span>
      </button>
      {user.avatarUrl && (
        <button
          type="button"
          onClick={() => start(() => void setUserAvatar(user.id, null))}
          title="Remove photo"
          className="absolute -right-1 -top-1 hidden h-4 w-4 place-items-center rounded-full bg-white text-[9px] text-danger shadow group-hover/av:grid"
        >
          ✕
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
    </div>
  );
}

/* ── Users ─────────────────────────────────────────── */
function UsersTab({
  users,
  roles,
  departments,
  currentUserId,
}: {
  users: UserRow[];
  roles: Role[];
  departments: Dept[];
  currentUserId: string;
}) {
  const [userMsg, userAction] = useActionState(createUser, null);
  return (
    <div className="max-w-5xl">
      <Card>
        <form action={userAction} className="flex flex-wrap items-end gap-3">
          <Field label="Name">
            <input name="name" required className={inputCls} placeholder="Jane Doe" />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required className={inputCls} placeholder="jane@oswin.co" />
          </Field>
          <Field label="Role">
            <select name="roleId" className={inputCls} defaultValue="">
              <option value="">—</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Department">
            <select name="departmentId" className={inputCls} defaultValue="">
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <button className={btnPrimary}>Add user</button>
        </form>
        {userMsg && <p className="mt-2 text-sm text-danger">{userMsg}</p>}
      </Card>

      <div className="mt-4 overflow-x-auto scroll-thin rounded-lg border border-hair bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-hair text-left text-xs text-muted">
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Department</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow
                key={u.id}
                u={u}
                roles={roles}
                departments={departments}
                isSelf={u.id === currentUserId}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Tip: deactivating loses a user's history — set them to <b>Viewer</b> to keep
        their footprint on a free seat.
      </p>
    </div>
  );
}

function UserRow({
  u,
  roles,
  departments,
  isSelf,
}: {
  u: UserRow;
  roles: Role[];
  departments: Dept[];
  isSelf: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(u.name);
  const [email, setEmail] = useState(u.email);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  return (
    <tr className="border-b border-hair last:border-0">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <AvatarUpload user={u} />
          {editing ? (
            <div className="flex flex-col gap-1">
              <input value={name} onChange={(e) => setName(e.target.value)} className={selCls} placeholder="Name" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} className={selCls} placeholder="Email" />
              {err && <span className="text-xs text-danger">{err}</span>}
            </div>
          ) : (
            <div>
              <p className="font-medium text-ink">{u.name}{isSelf && <span className="ml-1 text-xs text-muted">(you)</span>}</p>
              <p className="text-xs text-muted">{u.email}</p>
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <select
          value={u.roleId ?? ""}
          onChange={(e) => start(() => void setUserRole(u.id, e.target.value || null))}
          className={selCls}
        >
          <option value="">—</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5">
        <select
          value={u.departmentId ?? ""}
          onChange={(e) => start(() => void setUserDepartment(u.id, e.target.value || null))}
          className={selCls}
        >
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5">
        <select
          value={u.status}
          onChange={(e) => start(() => void setUserStatus(u.id, e.target.value))}
          className={selCls}
          style={{ color: USER_STATUS_META[u.status as keyof typeof USER_STATUS_META]?.color }}
        >
          {USER_STATUSES.map((s) => (
            <option key={s} value={s}>{USER_STATUS_META[s].label}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5">
        {editing ? (
          <div className="flex gap-2">
            <button
              onClick={() =>
                start(async () => {
                  const e = await editUser(u.id, name, email);
                  if (e) setErr(e);
                  else { setErr(null); setEditing(false); }
                })
              }
              className="text-xs font-semibold text-teal hover:underline"
            >
              Save
            </button>
            <button onClick={() => { setEditing(false); setErr(null); setName(u.name); setEmail(u.email); }} className="text-xs text-muted hover:text-body">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => setEditing(true)} className="text-xs text-teal hover:underline">Edit</button>
            {!isSelf && (
              <button
                onClick={() => {
                  if (confirm(`Delete ${u.name}? This can't be undone. (Tip: set to Viewer to keep their history.)`))
                    start(() => void deleteUser(u.id));
                }}
                className="text-xs text-muted hover:text-danger"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

/* ── Roles ─────────────────────────────────────────── */
function RolesTab({ roles, boards }: { roles: Role[]; boards: BoardLite[] }) {
  const [roleMsg, roleAction] = useActionState(addRole, null);
  return (
    <div className="max-w-3xl">
      <Card>
        <form action={roleAction} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Role name">
              <input name="name" required className={inputCls} placeholder="e.g. Tester" />
            </Field>
            <Field label="Color">
              <input name="color" type="color" defaultValue="#5B7A99" className="h-9 w-14 rounded border border-hair" />
            </Field>
            <label className="flex items-center gap-2 pb-2 text-sm text-body">
              <input name="readOnly" type="checkbox" /> Read-only
            </label>
            <button className={btnPrimary}>Add role</button>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-body">
              Board access <span className="font-normal text-muted">(none selected = all boards)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {boards.map((b) => (
                <label key={b.id} className="flex items-center gap-1.5 rounded-full border border-hair px-2.5 py-1 text-xs text-body">
                  <input type="checkbox" name="boards" value={b.id} /> {b.name}
                </label>
              ))}
            </div>
          </div>
        </form>
        {roleMsg && <p className="mt-2 text-sm text-danger">{roleMsg}</p>}
      </Card>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {roles.map((r) => (
          <RoleCard key={r.id} role={r} boards={boards} />
        ))}
      </div>
    </div>
  );
}

function RoleCard({ role, boards }: { role: Role; boards: BoardLite[] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [readOnly, setReadOnly] = useState(role.readOnly);
  const [sel, setSel] = useState<string[]>(role.boards === "all" ? [] : role.boards);
  const [, start] = useTransition();

  function toggle(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-teal/40 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 rounded border border-hair" />
          <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-md border border-hair px-2 py-1 text-sm outline-none focus:border-teal" />
        </div>
        {!role.isSystem && (
          <>
            <label className="mt-2 flex items-center gap-2 text-xs text-body">
              <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} /> Read-only
            </label>
            <p className="mt-2 text-xs font-semibold text-body">
              Board access <span className="font-normal text-muted">(none = all)</span>
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {boards.map((b) => (
                <label key={b.id} className="flex items-center gap-1 rounded-full border border-hair px-2 py-0.5 text-[11px] text-body">
                  <input type="checkbox" checked={sel.includes(b.id)} onChange={() => toggle(b.id)} /> {b.name}
                </label>
              ))}
            </div>
          </>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button onClick={() => setEditing(false)} className="text-xs text-muted hover:text-body">Cancel</button>
          <button
            onClick={() => {
              start(() => void editRole(role.id, name, color, readOnly, sel));
              setEditing(false);
            }}
            className="rounded-md bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-deep"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  const scopeLabel =
    role.boards === "all" ? "all boards" : `${role.boards.length} board${role.boards.length === 1 ? "" : "s"}`;

  return (
    <div className="flex items-center justify-between rounded-lg border border-hair bg-white px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="h-3 w-3 rounded" style={{ background: role.color }} />
        <div>
          <p className="font-medium text-ink">{role.name}</p>
          <p className="text-xs text-muted">
            {role.isSystem ? "System role" : "Custom role"}
            {role.readOnly ? " · read-only" : ""} · {scopeLabel}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setEditing(true)} className="text-xs text-teal hover:underline">Edit</button>
        {!role.isSystem && (
          <button onClick={() => start(() => void deleteRole(role.id))} className="text-xs text-muted hover:text-danger">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Departments ───────────────────────────────────── */
function DepartmentsTab({ departments }: { departments: Dept[] }) {
  const [deptMsg, deptAction] = useActionState(addDepartment, null);
  return (
    <div className="max-w-3xl">
      <Card>
        <form action={deptAction} className="flex flex-wrap items-end gap-3">
          <Field label="Department name">
            <input name="name" required className={inputCls} placeholder="e.g. Marketing" />
          </Field>
          <Field label="Color">
            <input name="color" type="color" defaultValue="#0B7A6F" className="h-9 w-14 rounded border border-hair" />
          </Field>
          <button className={btnPrimary}>Add department</button>
        </form>
        {deptMsg && <p className="mt-2 text-sm text-danger">{deptMsg}</p>}
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        {departments.map((d) => (
          <DeptChip key={d.id} dept={d} />
        ))}
      </div>
    </div>
  );
}

function DeptChip({ dept }: { dept: Dept }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dept.name);
  const [color, setColor] = useState(dept.color);
  const [, start] = useTransition();

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-teal/40 bg-white py-1 pl-2 pr-1.5">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-6 w-7 rounded border border-hair" />
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-28 rounded border border-hair px-1.5 py-0.5 text-sm outline-none focus:border-teal" />
        <button
          onClick={() => {
            start(() => void editDepartment(dept.id, name, color));
            setEditing(false);
          }}
          className="rounded-full bg-teal px-2 py-0.5 text-xs font-semibold text-white"
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-hair bg-white py-1.5 pl-3 pr-2 text-sm">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: dept.color }} />
      <span className="text-body">{dept.name}</span>
      <button onClick={() => setEditing(true)} className="text-xs text-teal hover:underline">edit</button>
      <button
        onClick={() => start(() => void deleteDepartment(dept.id))}
        className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
      >
        ✕
      </button>
    </div>
  );
}

/* ── Invitations ───────────────────────────────────── */
function InvitesTab({ invitations, roles }: { invitations: Invite[]; roles: Role[] }) {
  const [, start] = useTransition();
  return (
    <div className="max-w-3xl">
      <Card>
        <form
          action={(fd) => start(() => void createInvitation(fd))}
          className="flex flex-wrap items-end gap-3"
        >
          <Field label="Email to invite">
            <input name="email" type="email" required className={inputCls} placeholder="anyone@gmail.com" />
          </Field>
          <Field label="Role on accept">
            <select name="roleId" className={inputCls} defaultValue="">
              <option value="">Viewer (default)</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </Field>
          <button className={btnPrimary}>Send invite</button>
        </form>
      </Card>

      <div className="mt-4 overflow-hidden rounded-lg border border-hair bg-white">
        {invitations.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted">No invitations yet.</p>
        )}
        {invitations.map((i) => (
          <div key={i.id} className="border-b border-hair px-4 py-3 last:border-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">{i.email}</p>
                <p className="text-xs text-muted">
                  {roles.find((r) => r.id === i.roleId)?.name ?? "Viewer"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={i.status} />
                {i.status === "pending" && (
                  <button
                    onClick={() => start(() => void revokeInvitation(i.id))}
                    className="text-xs text-muted hover:text-danger"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
            {i.status === "pending" && <InviteLink token={i.token} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function InviteLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/invite/${token}` : "";
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-hair bg-canvas px-3 py-1.5">
      <span className="truncate font-mono text-xs text-body">{link}</span>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="ml-auto flex-none rounded bg-teal px-2 py-1 text-xs font-semibold text-white hover:bg-teal-deep"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "accepted" ? "#2E9C63" : status === "revoked" ? "#C0392B" : "#C67A1E";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ background: color }}
    >
      {status}
    </span>
  );
}

/* ── shared bits ───────────────────────────────────── */
const inputCls =
  "rounded-lg border border-hair bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal";
const selCls =
  "rounded-md border border-hair bg-white px-2 py-1 text-sm text-body outline-none focus:border-teal";
const btnPrimary =
  "rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep";

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-hair bg-white p-4">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-body">{label}</span>
      {children}
    </label>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 font-semibold">{children}</th>;
}
