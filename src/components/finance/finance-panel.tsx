"use client";

import { useMemo, useState, useTransition } from "react";
import { formatMoney } from "@/lib/money";
import {
  createInvoiceRequest,
  approveInvoice,
  rejectInvoice,
  generateInvoice,
  markPaid,
  markPaidOffline,
  deleteInvoice,
} from "@/app/actions/finance";

type Invoice = {
  id: string;
  account: string;
  candidateName: string;
  candidateEmail: string;
  amountCents: number;
  currency: string;
  description: string;
  department: string;
  status: string;
  paymentMethod: string;
  stripeUrl: string | null;
};
type Dep = { id: string; name: string };

const ACCOUNTS: Record<string, { label: string; color: string }> = {
  pty: { label: "Osphine PTY", color: "#0B7A6F" },
  global: { label: "Osphine Global", color: "#C67A1E" },
};

const STAGES = [
  { key: "requested", label: "Intake · Requested", color: "#5B7A99" },
  { key: "approved", label: "Approved", color: "#2D6CDF" },
  { key: "invoiced", label: "Invoiced", color: "#C67A1E" },
  { key: "paid", label: "Paid", color: "#2E9C63" },
];

export function FinancePanel({
  invoices,
  departments,
  isAdmin,
  readOnly,
}: {
  invoices: Invoice[];
  departments: Dep[];
  isAdmin: boolean;
  readOnly: boolean;
}) {
  const [account, setAccount] = useState<"all" | "pty" | "global">("all");
  const [requesting, setRequesting] = useState(false);

  const filtered = useMemo(
    () => (account === "all" ? invoices : invoices.filter((i) => i.account === account)),
    [invoices, account]
  );

  const sum = (pred: (i: Invoice) => boolean) =>
    filtered.filter(pred).reduce((n, i) => n + i.amountCents, 0);
  const paidTotal = sum((i) => i.status === "paid");
  const outstanding = sum((i) => i.status === "invoiced");
  const pipeline = sum((i) => ["requested", "approved"].includes(i.status));

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Accounts</p>
            <h1 className="text-lg font-bold text-ink">Finance</h1>
          </div>
          {!readOnly && (
            <button
              onClick={() => setRequesting(true)}
              className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-deep"
            >
              + Request invoice
            </button>
          )}
        </div>

        {/* account filter */}
        <div className="mt-3 inline-flex rounded-lg border border-hair bg-canvas p-0.5">
          {(["all", "pty", "global"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAccount(a)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                account === a ? "bg-white text-ink shadow-soft" : "text-muted hover:text-body"
              }`}
            >
              {a === "all" ? "All accounts" : ACCOUNTS[a].label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-auto scroll-thin p-4 sm:p-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Revenue (paid)" value={formatMoney(paidTotal)} accent="#2E9C63" />
          <Kpi label="Outstanding (invoiced)" value={formatMoney(outstanding)} accent="#C67A1E" />
          <Kpi label="In pipeline" value={formatMoney(pipeline)} accent="#5B7A99" />
          <Kpi label="Invoices" value={String(filtered.length)} accent="#0B7A6F" />
        </div>

        {/* pipeline */}
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          {STAGES.map((stage) => {
            const items = filtered.filter((i) => i.status === stage.key);
            return (
              <div key={stage.key} className="flex flex-col">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                  <h3 className="text-sm font-bold" style={{ color: stage.color }}>
                    {stage.label}
                  </h3>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">
                    {items.length}
                  </span>
                </div>
                <div
                  className="flex flex-col gap-2 rounded-xl p-2"
                  style={{ background: `${stage.color}0f`, minHeight: 80 }}
                >
                  {items.map((inv) => (
                    <InvoiceCard key={inv.id} inv={inv} isAdmin={isAdmin} />
                  ))}
                  {items.length === 0 && (
                    <p className="px-2 py-4 text-center text-xs text-muted">Empty</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {requesting && (
        <RequestModal departments={departments} onClose={() => setRequesting(false)} />
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-hair bg-white p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink tabular-nums">{value}</p>
    </div>
  );
}

function InvoiceCard({ inv, isAdmin }: { inv: Invoice; isAdmin: boolean }) {
  const [, start] = useTransition();
  const acct = ACCOUNTS[inv.account] ?? ACCOUNTS.pty;
  const run = (fn: () => Promise<void>) => start(() => void fn());

  return (
    <div className="rounded-lg border border-hair bg-white p-3 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{inv.candidateName}</p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
          style={{ background: acct.color }}
        >
          {acct.label}
        </span>
      </div>
      <p className="mt-0.5 text-lg font-extrabold tabular-nums text-ink">
        {formatMoney(inv.amountCents, inv.currency)}
      </p>
      {inv.description && <p className="mt-0.5 text-xs text-muted">{inv.description}</p>}
      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted">
        {inv.department && <span className="rounded bg-canvas px-1.5 py-0.5">{inv.department}</span>}
        {inv.candidateEmail && <span className="truncate">{inv.candidateEmail}</span>}
      </div>

      {inv.stripeUrl && (
        <a
          href={inv.stripeUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block truncate text-xs font-medium text-teal hover:underline"
        >
          ↗ View Stripe invoice
        </a>
      )}

      {isAdmin && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {inv.status === "requested" && (
            <>
              <Btn onClick={() => run(() => approveInvoice(inv.id))} kind="primary">Approve</Btn>
              <Btn onClick={() => run(() => rejectInvoice(inv.id))} kind="ghost">Reject</Btn>
            </>
          )}
          {inv.status === "approved" && (
            <Btn onClick={() => run(() => generateInvoice(inv.id))} kind="primary">
              Generate invoice
            </Btn>
          )}
          {inv.status === "invoiced" && (
            <>
              <Btn onClick={() => run(() => markPaid(inv.id))} kind="primary">Mark paid</Btn>
              <Btn onClick={() => run(() => markPaidOffline(inv.id))} kind="ghost">Paid offline</Btn>
            </>
          )}
          {inv.status === "paid" && (
            <span className="text-xs font-medium text-grass">
              ✓ Paid{inv.paymentMethod === "offline" ? " · offline" : " · Stripe"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Btn({
  children,
  onClick,
  kind,
}: {
  children: React.ReactNode;
  onClick: () => void;
  kind: "primary" | "ghost";
}) {
  return (
    <button
      onClick={onClick}
      className={
        kind === "primary"
          ? "rounded-md bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-deep"
          : "rounded-md border border-hair px-2.5 py-1 text-xs text-muted hover:bg-canvas hover:text-danger"
      }
    >
      {children}
    </button>
  );
}

function RequestModal({ departments, onClose }: { departments: Dep[]; onClose: () => void }) {
  const [, start] = useTransition();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <form
        action={(fd) => {
          start(() => void createInvoiceRequest(fd));
          onClose();
        }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-hair bg-white p-5 shadow-pop"
      >
        <h2 className="text-lg font-bold text-ink">Request an invoice</h2>
        <p className="mt-0.5 text-sm text-muted">Accounts will verify before it's generated.</p>

        <div className="mt-4 grid gap-3">
          <Field label="Candidate name">
            <input name="candidateName" required className={inp} placeholder="Full name" />
          </Field>
          <Field label="Candidate email">
            <input name="candidateEmail" type="email" className={inp} placeholder="candidate@email.com" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (AUD)">
              <input name="amount" required inputMode="decimal" className={inp} placeholder="1250.00" />
            </Field>
            <Field label="Account">
              <select name="account" className={inp} defaultValue="pty">
                <option value="pty">Osphine PTY</option>
                <option value="global">Osphine Global</option>
              </select>
            </Field>
          </div>
          <Field label="Department">
            <select name="department" className={inp} defaultValue="">
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <input name="description" className={inp} placeholder="e.g. SAP 400 program payment" />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-canvas">
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep">
            Submit request
          </button>
        </div>
      </form>
    </div>
  );
}

const inp =
  "w-full rounded-lg border border-hair bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-teal";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-body">{label}</span>
      {children}
    </label>
  );
}
