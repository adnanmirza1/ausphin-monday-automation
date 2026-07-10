"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { sendItemEmail } from "@/app/actions/email";

// In-platform email composer (Improvement #2). Opens inside the app instead of
// launching Gmail / an external mail client. Sends via the server mailer and
// records the message on the item's conversation history.
export function EmailComposer({
  boardId,
  itemId,
  defaultTo = "",
  defaultSubject = "",
  defaultBody = "",
  onClose,
  onSent,
}: {
  boardId: string;
  itemId: string;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setErr(null);
    setMsg(null);
    start(async () => {
      const res = await sendItemEmail(boardId, itemId, to, subject, body);
      if (!res.ok) {
        setErr(res.error ?? "Could not send.");
        return;
      }
      onSent?.();
      setMsg(
        res.delivered
          ? "Email sent."
          : "Saved to conversation history. (Connect SMTP in Integrations to deliver it.)"
      );
      setTimeout(onClose, res.delivered ? 700 : 1600);
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">✉ New email</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-canvas">
            ✕
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-body">To</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="candidate@email.com"
              className={inp}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-body">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className={inp}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-body">Message</span>
            <textarea
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              className={inp}
            />
          </label>
        </div>

        {err && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{err}</p>}
        {msg && <p className="mt-2 rounded-lg bg-grass/10 px-3 py-2 text-xs text-grass">{msg}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={pending}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const inp =
  "w-full rounded-lg border border-hair bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal";
