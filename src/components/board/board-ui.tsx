"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react";
import {
  getItemUpdates,
  addUpdate,
  type UpdateRow,
} from "@/app/actions/updates";
import {
  getItemDocs,
  generateDocument,
  sendDocForSignature,
  type DocRow,
} from "@/app/actions/docs";
import { requestInvoiceForItem } from "@/app/actions/finance";
import {
  getItemTags,
  tagCandidate,
  untagCandidate,
  type ItemTag,
} from "@/app/actions/employers";
import { getItemInbox, logItemEmail, type EmailRow } from "@/app/actions/email";
import { EmailComposer } from "@/components/board/email-composer";
import { TAG_STAGES, TAG_STAGE_META, type TagStage } from "@/lib/constants";
import type { TemplateLite } from "./docs-button";

type Dept = { id: string; name: string };
type EmployerLite = { id: string; name: string };
type Selected = { id: string; name: string } | null;

const Ctx = createContext<{ open: (item: { id: string; name: string }) => void }>({
  open: () => {},
});

export function useBoardUI() {
  return useContext(Ctx);
}

export function BoardUIProvider({
  boardId,
  departments,
  templates,
  employers,
  children,
}: {
  boardId: string;
  departments: Dept[];
  templates: TemplateLite[];
  employers: EmployerLite[];
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Selected>(null);

  return (
    <Ctx.Provider value={{ open: (item) => setSelected(item) }}>
      {children}
      {selected && (
        <ItemPanel
          key={selected.id}
          boardId={boardId}
          item={selected}
          departments={departments}
          templates={templates}
          employers={employers}
          onClose={() => setSelected(null)}
        />
      )}
    </Ctx.Provider>
  );
}

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("");
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function ItemPanel({
  boardId,
  item,
  departments,
  templates,
  employers,
  onClose,
}: {
  boardId: string;
  item: { id: string; name: string };
  departments: Dept[];
  templates: TemplateLite[];
  employers: EmployerLite[];
  onClose: () => void;
}) {
  const [updates, setUpdates] = useState<UpdateRow[] | null>(null);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [genId, setGenId] = useState<string>(templates[0]?.id ?? "");
  const [tags, setTags] = useState<ItemTag[] | null>(null);
  const [tagEmp, setTagEmp] = useState<string>(employers[0]?.id ?? "");
  const [tagStage, setTagStage] = useState<TagStage>("interview");
  const [invMsg, setInvMsg] = useState<string | null>(null);
  const [signMsg, setSignMsg] = useState<string | null>(null);
  const [emails, setEmails] = useState<EmailRow[] | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [composing, setComposing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [, start] = useTransition();

  function refreshEmails() {
    getItemInbox(item.id).then((r) => {
      setEmails(r.emails);
      setEmailTo(r.to);
    });
  }

  function requestInvoice(account: string) {
    start(async () => {
      await requestInvoiceForItem(boardId, item.id, account);
      setInvMsg(`Invoice request sent to Finance (${account === "global" ? "Global" : "PTY"}).`);
      setTimeout(() => setInvMsg(null), 3000);
    });
  }

  async function refresh() {
    setUpdates(await getItemUpdates(item.id));
  }
  useEffect(() => {
    // Panel state resets on item switch via `key={selected.id}` (remount), so
    // the effect only needs to (re)load this item's data.
    getItemUpdates(item.id).then(setUpdates);
    getItemDocs(item.id).then(setDocs);
    getItemTags(item.id).then(setTags);
    getItemInbox(item.id).then((r) => {
      setEmails(r.emails);
      setEmailTo(r.to);
    });
  }, [item.id]);

  function addTag() {
    if (!tagEmp) return;
    start(async () => {
      await tagCandidate(boardId, item.id, tagEmp, tagStage);
      setTags(await getItemTags(item.id));
    });
  }
  function removeTag(tagId: string) {
    start(async () => {
      await untagCandidate(boardId, tagId);
      setTags(await getItemTags(item.id));
    });
  }

  function generate() {
    if (!genId) return;
    start(async () => {
      const id = await generateDocument(boardId, item.id, genId);
      setDocs(await getItemDocs(item.id));
      if (id) window.open(`/doc/${id}`, "_blank");
    });
  }

  function post() {
    const text = body.trim();
    if (!text) return;
    const mts = [...mentions];
    setBody("");
    setMentions([]);
    start(async () => {
      await addUpdate(boardId, item.id, text, mts);
      await refresh();
    });
  }

  function toggleMention(id: string) {
    setMentions((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-pop animate-rise">
        {/* header */}
        <div className="flex items-center justify-between border-b border-hair px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Item</p>
            <h2 className="truncate text-lg font-bold text-ink">{item.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-canvas"
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto scroll-thin p-5">
          {/* employer tagging */}
          <div className="mb-5">
            <h3 className="mb-2 text-sm font-bold text-ink">Employer</h3>
            {tags && tags.length > 0 && (
              <div className="mb-2 flex flex-col gap-1.5">
                {tags.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-hair px-3 py-1.5"
                  >
                    <span className="text-sm font-medium text-ink">{t.employerName}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                        style={{ background: TAG_STAGE_META[t.stage as TagStage]?.color ?? "#9AA4B2" }}
                      >
                        {TAG_STAGE_META[t.stage as TagStage]?.label ?? t.stage}
                      </span>
                      <button
                        onClick={() => removeTag(t.id)}
                        className="text-muted hover:text-danger"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {employers.length === 0 ? (
              <p className="text-xs text-muted">
                No employers yet — add them under <b>Employers</b> in the sidebar.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={tagEmp}
                  onChange={(e) => setTagEmp(e.target.value)}
                  className="flex-1 rounded-lg border border-hair px-2.5 py-1.5 text-sm outline-none focus:border-teal"
                >
                  {employers.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <select
                  value={tagStage}
                  onChange={(e) => setTagStage(e.target.value as TagStage)}
                  className="rounded-lg border border-hair px-2.5 py-1.5 text-sm outline-none focus:border-teal"
                >
                  {TAG_STAGES.map((s) => (
                    <option key={s} value={s}>{TAG_STAGE_META[s].label}</option>
                  ))}
                </select>
                <button
                  onClick={addTag}
                  className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-deep"
                >
                  Tag
                </button>
              </div>
            )}
          </div>

          <div className="mb-3 border-t border-hair" />

          {/* finance */}
          <div className="mb-5">
            <h3 className="mb-2 text-sm font-bold text-ink">Finance</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Request invoice:</span>
              <button
                onClick={() => requestInvoice("pty")}
                className="rounded-lg border border-hair px-2.5 py-1 text-xs font-medium text-body hover:bg-canvas"
              >
                Osphine PTY
              </button>
              <button
                onClick={() => requestInvoice("global")}
                className="rounded-lg border border-hair px-2.5 py-1 text-xs font-medium text-body hover:bg-canvas"
              >
                Osphine Global
              </button>
            </div>
            {invMsg && <p className="mt-1.5 text-xs font-medium text-grass">{invMsg}</p>}
          </div>

          <div className="mb-3 border-t border-hair" />

          {/* documents */}
          <div className="mb-5">
            <h3 className="mb-2 text-sm font-bold text-ink">Documents</h3>
            {templates.length === 0 ? (
              <p className="text-xs text-muted">
                No templates yet — create one via <b>📄 Docs</b> in the board header.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={genId}
                  onChange={(e) => setGenId(e.target.value)}
                  className="flex-1 rounded-lg border border-hair px-2.5 py-1.5 text-sm outline-none focus:border-teal"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={generate}
                  className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-deep"
                >
                  Generate
                </button>
              </div>
            )}
            {docs && docs.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                {docs.map((d) => (
                  <div key={d.id} className="rounded-lg border border-hair px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>📄</span>
                      <a
                        href={`/doc/${d.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 truncate text-sm text-body hover:text-teal-deep"
                      >
                        {d.name}
                      </a>
                      <a href={`/doc/${d.id}`} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-teal">
                        open ↗
                      </a>
                      <button
                        onClick={() =>
                          start(async () => {
                            const msg = await sendDocForSignature(d.id);
                            setSignMsg(msg);
                            setTimeout(() => setSignMsg(null), 4000);
                          })
                        }
                        className="text-xs font-medium text-teal hover:underline"
                        title="Send to candidate for e-signature (DocuSign)"
                      >
                        ✍ e-sign
                      </button>
                    </div>
                  </div>
                ))}
                {signMsg && <p className="text-xs font-medium text-teal-deep">{signMsg}</p>}
              </div>
            )}
          </div>

          <div className="mb-3 border-t border-hair" />

          {/* email conversation (Improvement #2 + Missing #2) */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">Emails</h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setLogging(true)}
                  className="rounded-lg border border-hair px-2.5 py-1 text-xs font-medium text-body hover:bg-canvas"
                >
                  Log reply
                </button>
                <button
                  onClick={() => setComposing(true)}
                  className="rounded-lg bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-deep"
                >
                  ✉ New email
                </button>
              </div>
            </div>
            {emails === null && <p className="text-sm text-muted">Loading…</p>}
            {emails?.length === 0 && (
              <p className="text-xs text-muted">
                No emails yet. Use <b>New email</b> to write to this candidate — every message is
                saved here for the whole team.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {emails?.map((e) => (
                <div key={e.id} className="rounded-xl border border-hair bg-canvas/40 p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        e.direction === "outbound"
                          ? "bg-teal/10 text-teal-deep"
                          : e.direction === "inbound"
                          ? "bg-steel/15 text-steel"
                          : "bg-canvas text-muted"
                      }`}
                    >
                      {e.direction === "outbound" ? "Sent" : e.direction === "inbound" ? "Received" : "Note"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
                      {e.subject || "(no subject)"}
                    </span>
                    <span className="flex-none text-[11px] text-muted">{timeAgo(e.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {e.direction === "outbound"
                      ? `to ${e.toEmail}`
                      : e.fromEmail
                      ? `from ${e.fromEmail}`
                      : ""}
                    {" · "}
                    {e.authorName}
                  </p>
                  {e.body && (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-body">{e.body}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mb-3 border-t border-hair" />

          {/* updates */}
          <h3 className="mb-3 text-sm font-bold text-ink">Updates</h3>
          {updates === null && <p className="text-sm text-muted">Loading…</p>}
          {updates?.length === 0 && (
            <p className="text-sm text-muted">No updates yet. Post the first one.</p>
          )}
          <div className="flex flex-col gap-3">
            {updates?.map((u) => (
              <div key={u.id} className="rounded-xl border border-hair bg-canvas/40 p-3">
                <div className="flex items-center gap-2">
                  <span
                    className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: u.authorColor }}
                  >
                    {initials(u.authorName)}
                  </span>
                  <span className="text-xs font-semibold text-ink">{u.authorName}</span>
                  <span className="text-xs text-muted">· {timeAgo(u.createdAt)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-body">{u.body}</p>
                {u.mentionNames.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {u.mentionNames.map((n) => (
                      <span
                        key={n}
                        className="rounded-full bg-teal/10 px-2 py-0.5 text-[11px] font-medium text-teal-deep"
                      >
                        @{n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* composer */}
        <div className="border-t border-hair p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write an update…"
            rows={2}
            className="w-full resize-none rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {departments.map((d) => (
              <button
                key={d.id}
                onClick={() => toggleMention(d.id)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  mentions.includes(d.id)
                    ? "border-teal bg-teal/10 text-teal-deep"
                    : "border-hair text-muted hover:border-teal/40"
                }`}
              >
                @{d.name}
              </button>
            ))}
          </div>
          <button
            onClick={post}
            disabled={!body.trim()}
            className="mt-2 w-full rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            Post update
          </button>
        </div>
      </div>

      {composing && (
        <EmailComposer
          boardId={boardId}
          itemId={item.id}
          defaultTo={emailTo}
          onClose={() => setComposing(false)}
          onSent={refreshEmails}
        />
      )}
      {logging && (
        <LogEmailModal
          boardId={boardId}
          itemId={item.id}
          onClose={() => setLogging(false)}
          onLogged={refreshEmails}
        />
      )}
    </div>
  );
}

// Manually log a received reply / note into the conversation history.
function LogEmailModal({
  boardId,
  itemId,
  onClose,
  onLogged,
}: {
  boardId: string;
  itemId: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [fromEmail, setFromEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      await logItemEmail(boardId, itemId, { direction: "inbound", fromEmail, subject, body });
      onLogged();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-hair bg-white p-5 shadow-pop">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Log a received email</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-canvas">
            ✕
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          <input
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="From (their email)"
            className="w-full rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
          />
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What they wrote…"
            className="w-full rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-teal"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={pending || (!body.trim() && !subject.trim())}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save to history"}
          </button>
        </div>
      </div>
    </div>
  );
}
