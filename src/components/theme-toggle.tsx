"use client";

import { useEffect, useState } from "react";

// Per-user light/dark toggle. Persists to localStorage and flips data-theme
// on <html>; the no-flash script in the root layout applies it on load.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "dark");
      try {
        localStorage.setItem("theme", "dark");
      } catch {}
    } else {
      document.documentElement.removeAttribute("data-theme");
      try {
        localStorage.setItem("theme", "light");
      } catch {}
    }
  }

  return (
    <button
      onClick={toggle}
      className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white/70 hover:bg-rail-hover"
      title="Toggle light / dark"
    >
      <span className="font-mono text-xs">{dark ? "☀" : "☾"}</span>
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
