"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { sendItemEmail, getEmailSenders, type EmailAttachment } from "@/app/actions/email";

// In-platform email composer. Opens inside the app (monday-style) instead of an
// external mail client. Supports From (authorized senders) / To / CC / BCC /
// Subject / Message / Attachments, sends via the server mailer, and records the
// message on the item's conversation history.
const MAX_ATTACH_TOTAL = 8 * 1024 * 1024; // 8 MB

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
  const [senders, setSenders] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  // Load the logged-in user's authorized sender addresses; default to the first.
  useEffect(() => {
    getEmailSenders().then((list) => {
      setSenders(list);
      setFrom((f) => f || list[0] || "");
    });
  }, []);

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (chosen.length === 0) return;
    setErr(null);
    Promise.all(
      chosen.map(
        (f) =>
          new Promise<EmailAttachment>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve({ name: f.name, type: f.type, dataUrl: String(r.result) });
            r.onerror = () => reject(r.error);
            r.readAsDataURL(f);
          })
      )
    ).then((added) => {
      const next = [...attachments, ...added];
      const total = next.reduce((s, a) => s + Math.ceil((a.dataUrl.length * 3) / 4), 0);
      if (total > MAX_ATTACH_TOTAL) {
        setErr("Attachments exceed 8 MB total.");
        return;
      }
      setAttachments(next);
    });
  }

  function send() {
    setErr(null);
    setMsg(null);
    start(async () => {
      const res = await sendItemEmail(boardId, itemId, { from, to, cc, bcc, subject, body, attachments });
      if (!res.ok) {
        setErr(res.error ?? "Could not send.");
        return;
      }
      onSent?.();
      if (res.delivered) {
        setMsg("✓ Email sent.");
        setTimeout(onClose, 800);
      } else if (res.configured) {
        setErr(
          "Email could not be delivered — the mail server rejected it (check the email settings / app password). It's saved to the conversation history."
        );
      } else {
        setMsg("Saved to conversation history. Email isn't set up yet (add SMTP to deliver).");
        setTimeout(onClose, 1800);
      }
    });
  }

  const attachTotal = attachments.reduce((s, a) => s + Math.ceil((a.dataUrl.length * 3) / 4), 0);

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">✉ New email</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-canvas">
            ✕
          </button>
        </div>

        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto scroll-thin pr-0.5">
          {/* From — authorized senders */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-body">From</span>
            {senders.length > 1 ? (
              <select value={from} onChange={(e) => setFrom(e.target.value)} className={inp}>
                {senders.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <input value={from} readOnly className={`${inp} text-muted`} />
            )}
          </label>

          {/* To + CC/BCC toggles */}
          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-[11px] font-semibold text-body">
              To
              <span className="flex gap-2 font-normal">
                {!showCc && (
                  <button type="button" onClick={() => setShowCc(true)} className="text-teal hover:underline">Cc</button>
                )}
                {!showBcc && (
                  <button type="button" onClick={() => setShowBcc(true)} className="text-teal hover:underline">Bcc</button>
                )}
              </span>
            </span>
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="candidate@email.com" className={inp} />
          </label>

          {showCc && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-body">Cc</span>
              <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="comma-separated" className={inp} />
            </label>
          )}
          {showBcc && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-body">Bcc</span>
              <input type="text" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="comma-separated" className={inp} />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-body">Subject</span>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={inp} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-body">Message</span>
            <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" className={inp} />
          </label>

          {/* Attachments */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-body">
                Attachments {attachments.length > 0 && <span className="text-muted">· {(attachTotal / 1024 / 1024).toFixed(1)} MB</span>}
              </span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-hair px-2.5 py-1 text-xs font-medium text-body hover:bg-canvas"
              >
                📎 Attach files
              </button>
              <input ref={fileRef} type="file" multiple onChange={onFiles} className="hidden" />
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-col gap-1">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-hair px-2 py-1 text-xs">
                    <span className="flex-1 truncate text-body" title={a.name}>📄 {a.name}</span>
                    <button
                      onClick={() => setAttachments((list) => list.filter((_, idx) => idx !== i))}
                      className="flex-none text-muted hover:text-danger"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
