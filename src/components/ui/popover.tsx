"use client";

// Shared dismissable-menu primitive used by every dropdown / popover / menu
// in the app (Columns, Filter, Sort, column "⋮" menu, cell pickers, sidebar
// menu, etc.) so open/close/positioning/keyboard mechanics behave the same
// way everywhere instead of each call site reimplementing its own
// `useState` + `fixed inset-0` overlay. Visual content (Tailwind classes)
// stays entirely with the caller — this only owns the mechanics:
//   - outside-click to close (fixed inset-0 overlay, no backdrop dimming)
//   - Escape closes + returns focus to the trigger
//   - viewport-boundary clamping (flips above the trigger / clamps
//     horizontally so the panel never renders off-screen)
//   - portal to document.body so parent overflow/z-index never clips it
//   - optional Up/Down + Enter navigation for list-style menus

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

export type PanelPos = { top: number; left: number; maxHeight: number };

const MARGIN = 8;

// Compute a panel position anchored to `anchor`, clamped inside the
// viewport: flips above the trigger when there isn't room below, and
// clamps horizontally so it never overflows either edge.
export function computePanelPosition(
  anchor: DOMRect,
  opts: { width?: number; preferredMaxHeight?: number; align?: "left" | "right" } = {}
): PanelPos {
  const { width = 240, preferredMaxHeight = 400, align = "left" } = opts;
  const below = window.innerHeight - anchor.bottom - MARGIN;
  const above = anchor.top - MARGIN;
  const openUp = below < Math.min(200, preferredMaxHeight) && above > below;

  let left = align === "right" ? anchor.right - width : anchor.left;
  if (left + width > window.innerWidth - MARGIN) left = window.innerWidth - width - MARGIN;
  if (left < MARGIN) left = MARGIN;

  return {
    top: openUp ? Math.max(MARGIN, anchor.top - 4) : anchor.bottom + 4,
    left,
    maxHeight: Math.min(preferredMaxHeight, openUp ? above : below),
  };
}

/**
 * Hook form of the primitive — for call sites that already manage their own
 * trigger button and just need positioning + dismiss behavior wired up
 * (mirrors the app's existing `FloatingPanel` pattern in cells.tsx).
 */
export function useDismissableMenu<T extends HTMLElement = HTMLButtonElement>({
  open,
  onClose,
  width = 240,
  maxHeight = 400,
  align = "left",
}: {
  open: boolean;
  onClose: () => void;
  width?: number;
  maxHeight?: number;
  align?: "left" | "right";
}) {
  const triggerRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<PanelPos | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (!el) return;
    setMeasured(computePanelPosition(el.getBoundingClientRect(), { width, preferredMaxHeight: maxHeight, align }));
  }, [open, width, maxHeight, align]);

  // Never expose a stale measurement from a previous open while closed.
  const pos = open ? measured : null;

  const close = useCallback(() => {
    onClose();
    // Return focus to the trigger for keyboard users (Escape support).
    triggerRef.current?.focus();
  }, [onClose]);

  // Escape closes + refocuses the trigger.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  // The board's content area can scroll independently of the window, which
  // would leave a `position: fixed` panel visually stuck over the wrong
  // content — close on any outside scroll (matches FloatingPanel's existing
  // behavior), ignoring scroll events that originate inside the panel.
  useEffect(() => {
    if (!open) return;
    function onScroll(e: Event) {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      onClose();
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open, onClose]);

  return { triggerRef, panelRef, pos, close };
}

/**
 * <DropdownMenu> — full component form: renders the trigger button, and
 * (when open) a portal-mounted panel with outside-click / Escape / viewport
 * clamping already wired up. Use this for the common case; use
 * `useDismissableMenu` directly when a call site needs a non-<button>
 * trigger element or custom trigger markup.
 */
export function DropdownMenu({
  open,
  onOpenChange,
  trigger,
  children,
  panelClassName = "",
  width = 240,
  maxHeight = 400,
  align = "left",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: (props: {
    ref: RefObject<HTMLButtonElement | null>;
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "menu" | "listbox" | "true";
  }) => ReactNode;
  children: ReactNode | ((api: { close: () => void }) => ReactNode);
  panelClassName?: string;
  width?: number;
  maxHeight?: number;
  align?: "left" | "right";
}) {
  const { triggerRef, panelRef, pos, close } = useDismissableMenu<HTMLButtonElement>({
    open,
    onClose: () => onOpenChange(false),
    width,
    maxHeight,
    align,
  });

  return (
    <>
      {trigger({
        ref: triggerRef,
        onClick: () => onOpenChange(!open),
        "aria-expanded": open,
        "aria-haspopup": "menu",
      })}
      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onMouseDown={close} />
            <div
              ref={panelRef}
              className={`fixed z-50 ${panelClassName}`}
              style={{ top: pos.top, left: pos.left, width, maxHeight: pos.maxHeight }}
            >
              {typeof children === "function" ? children({ close }) : children}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

/**
 * Opt-in Up/Down + Enter navigation for list-style menu content (searchable
 * pickers like Status/Person/Connection). Not every menu needs this — grid
 * color pickers and free-form toggle panels should skip it.
 *
 * Usage: give each selectable row a matching index via `itemProps(i)`, and
 * wire the container's onKeyDown to `onKeyDown`.
 */
export function useMenuListNav({
  count,
  onSelect,
  onEscape,
  active = true,
}: {
  count: number;
  onSelect: (index: number) => void;
  onEscape?: () => void;
  active?: boolean;
}) {
  const [highlight, setHighlight] = useState(-1);
  // Reset highlight whenever the list contents change size (e.g. filter text
  // changed), so a stale index never points at the wrong row. Computed
  // during render (React docs: "adjusting state when a prop changes", using
  // state — not a ref — to track the previous value) rather than in an
  // effect, which would cost an extra render pass.
  const [prevCount, setPrevCount] = useState(count);
  if (prevCount !== count) {
    setPrevCount(count);
    if (highlight !== -1) setHighlight(-1);
  }

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (!active || count === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % count);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h <= 0 ? count - 1 : h - 1));
      } else if (e.key === "Enter") {
        if (highlight >= 0 && highlight < count) {
          e.preventDefault();
          onSelect(highlight);
        }
      } else if (e.key === "Escape") {
        onEscape?.();
      }
    },
    [active, count, highlight, onSelect, onEscape]
  );

  return { highlight, setHighlight, onKeyDown };
}

// ── Drag & drop shared visual tokens ──────────────────────────────────
// One place for the "drop target" / "being dragged" styling so all 5 D&D
// features (group reorder, item reorder, column reorder, kanban cards,
// automation cards) look and feel consistent. Item reorder in table-view.tsx
// established the reference look (teal top border) — reused here.
export const DRAG_OVER_CLASS = "border-t-2 border-t-teal";
export const DRAGGING_CLASS = "opacity-50";
