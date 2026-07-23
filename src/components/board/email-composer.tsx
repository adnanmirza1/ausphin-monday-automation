"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  sendItemEmail,
  getEmailSenders,
  getItemFiles,
  googleConnectAvailable,
  type EmailAttachment,
  type BoardFile,
} from "@/app/actions/email";

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
  // "Attach from board" — files stored in the item's File columns.
  const [boardFiles, setBoardFiles] = useState<BoardFile[] | null>(null);
  const [showBoardFiles, setShowBoardFiles] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [canAddEmail, setCanAddEmail] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Load the logged-in user's authorized sender addresses; default to the first.
  const refreshSenders = (select?: string) =>
    getEmailSenders().then((list) => {
      setSenders(list);
      setFrom((f) => select || f || list[0] || "");
      return list;
    });

  useEffect(() => {
    refreshSenders();
    googleConnectAvailable().then(setCanAddEmail).catch(() => setCanAddEmail(false));
     
  }, []);

  // "+ Add email" — open Google OAuth in a popup and pick up the connected
  // address when the callback posts back (Requirement #1).
  function openAddEmail() {
    setErr(null);
    const w = 520;
    const h = 640;
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    const popup = window.open(
      "/api/oauth/google/start",
      "connect-email",
      `width=${w},height=${h},left=${left},top=${top}`
    );
    if (!popup) {
      setErr("Please allow pop-ups to connect an email account.");
      return;
    }
    setConnecting(true);
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { source?: string; ok?: boolean; detail?: string };
      if (!d || d.source !== "google-email-connect") return;
      setConnecting(false);
      if (d.ok && d.detail) {
        refreshSenders(d.detail);
        setMsg(`✓ Connected ${d.detail}.`);
        setTimeout(() => setMsg(null), 2500);
      } else {
        setErr(
          d.detail === "google_not_configured"
            ? "Google sign-in isn't set up yet — ask an admin to configure it."
            : "Could not connect that email account. Please try again."
        );
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
     
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
      const total = next.reduce((s, a) => s + bytesOf(a.dataUrl), 0);
      if (total > MAX_ATTACH_TOTAL) {
        setErr("Attachments exceed 8 MB total.");
        return;
      }
      setAttachments(next);
    });
  }

  function toggleBoardFiles() {
    setErr(null);
    if (showBoardFiles) {
      setShowBoardFiles(false);
      return;
    }
    setShowBoardFiles(true);
    if (boardFiles === null) {
      setLoadingFiles(true);
      getItemFiles(itemId)
        .then((list) => setBoardFiles(list))
        .catch(() => setBoardFiles([]))
        .finally(() => setLoadingFiles(false));
    }
  }

  // A board file is "attached" when an attachment with the same name + data
  // already exists (data URLs are identical for the same stored file).
  function isBoardFileAttached(f: BoardFile) {
    return attachments.some((a) => a.name === f.name && a.dataUrl === f.url);
  }

  function toggleBoardFile(f: BoardFile) {
    setErr(null);
    if (isBoardFileAttached(f)) {
      setAttachments((list) => list.filter((a) => !(a.name === f.name && a.dataUrl === f.url)));
      return;
    }
    const next = [...attachments, { name: f.name, type: f.type, dataUrl: f.url }];
    const total = next.reduce((s, a) => s + bytesOf(a.dataUrl), 0);
    if (total > MAX_ATTACH_TOTAL) {
      setErr("Attachments exceed 8 MB total.");
      return;
    }
    setAttachments(next);
  }

  function send() {
    setErr(null);
    setMsg(null);
    start(async () => {
      let res;
      try {
        res = await sendItemEmail(boardId, itemId, { from, to, cc, bcc, subject, body, attachments });
      } catch (e) {
        // e.g. a read-only role rejected by the server action — surface it
        // instead of hanging on "Sending…".
        setErr(
          /read-only|permission|not authenticated/i.test(String(e))
            ? "You don't have permission to send email from this account."
            : "Something went wrong sending the email. Please try again."
        );
        return;
      }
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

  const attachTotal = attachments.reduce((s, a) => s + bytesOf(a.dataUrl), 0);

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
          {/* From — authorized senders + connect another account */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-body">From</span>
            <div className="flex items-center gap-1.5">
              <select
                value={from}
                onChange={(e) => {
                  if (e.target.value === "__add__") {
                    openAddEmail();
                    return; // keep current selection
                  }
                  setFrom(e.target.value);
                }}
                className={`${inp} flex-1`}
              >
                {senders.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                {canAddEmail && <option value="__add__">➕ Add email account…</option>}
              </select>
              {canAddEmail && (
                <button
                  type="button"
                  onClick={openAddEmail}
                  disabled={connecting}
                  className="flex-none rounded-lg border border-hair px-2.5 py-2 text-xs font-medium text-body hover:bg-canvas disabled:opacity-60"
                  title="Connect another email account with Google"
                >
                  {connecting ? "Connecting…" : "+ Add"}
                </button>
              )}
            </div>
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
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg border border-hair px-2.5 py-1 text-xs font-medium text-body hover:bg-canvas"
                >
                  📎 Attach files
                </button>
                <button
                  type="button"
                  onClick={toggleBoardFiles}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    showBoardFiles ? "border-teal bg-teal/10 text-teal" : "border-hair text-body hover:bg-canvas"
                  }`}
                >
                  🗂 Attach from board
                </button>
              </div>
              <input ref={fileRef} type="file" multiple onChange={onFiles} className="hidden" />
            </div>

            {/* Board files picker — files stored on the item's File columns */}
            {showBoardFiles && (
              <div className="rounded-lg border border-hair bg-canvas/60 p-2">
                {loadingFiles ? (
                  <p className="px-1 py-1 text-xs text-muted">Loading files…</p>
                ) : !boardFiles || boardFiles.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-muted">
                    No files on this item&rsquo;s File columns yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {boardFiles.map((f, i) => {
                      const on = isBoardFileAttached(f);
                      return (
                        <button
                          key={`${f.columnId}-${f.name}-${i}`}
                          type="button"
                          onClick={() => toggleBoardFile(f)}
                          className={`flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs ${
                            on ? "border-teal bg-teal/10" : "border-hair bg-white hover:bg-canvas"
                          }`}
                        >
                          <span className={`flex-none ${on ? "text-teal" : "text-muted"}`}>{on ? "☑" : "☐"}</span>
                          <span className="flex-1 truncate text-body" title={f.name}>
                            📄 {f.name}
                          </span>
                          <span className="flex-none rounded bg-canvas px-1.5 py-0.5 text-[10px] text-muted" title={f.columnName}>
                            {f.columnName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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

// Approximate decoded byte size of a data URL (base64 payload after the comma).
function bytesOf(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.ceil((b64.length * 3) / 4);
}

const inp =
  "w-full rounded-lg border border-hair bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal";
