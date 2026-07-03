"use client";

import { useState } from "react";
import { Sidebar, type NavEnv, type SidebarUser } from "./sidebar";

export function AppShell({
  nav,
  user,
  children,
}: {
  nav: NavEnv[];
  user: SidebarUser;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar nav={nav} user={user} />
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 animate-rise">
            <Sidebar nav={nav} user={user} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-hair bg-rail px-4 py-2.5 text-white md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="grid h-8 w-8 place-items-center rounded-md hover:bg-rail-hover"
            aria-label="Open menu"
          >
            <span className="text-lg">☰</span>
          </button>
          <span className="grid h-6 w-6 place-items-center rounded bg-teal text-xs font-bold">
            O
          </span>
          <span className="font-semibold">Oswin Work OS</span>
        </div>

        <main className="min-h-0 flex-1 overflow-hidden bg-canvas">{children}</main>
      </div>
    </div>
  );
}
