"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor, requireAdmin } from "@/lib/guard";
import { parseMoney, formatMoney } from "@/lib/money";
import { createStripeInvoice, type StripeAccount } from "@/lib/stripe";
import { sendMail } from "@/lib/mailer";

function touch() {
  revalidatePath("/finance");
  revalidatePath("/dashboard");
}

// ── Request (any editor / department) ─────────────────────────
export async function createInvoiceRequest(formData: FormData) {
  const user = await requireEditor();
  const candidateName = String(formData.get("candidateName") ?? "").trim();
  const candidateEmail = String(formData.get("candidateEmail") ?? "").trim();
  const amountCents = parseMoney(String(formData.get("amount") ?? ""));
  const description = String(formData.get("description") ?? "").trim();
  const account = (String(formData.get("account") ?? "pty") as StripeAccount) || "pty";
  const department = String(formData.get("department") ?? "").trim();
  if (!candidateName || amountCents <= 0) return;

  await db.invoice.create({
    data: {
      orgId: user.orgId,
      account,
      candidateName,
      candidateEmail,
      amountCents,
      description,
      department: department || user.department?.name || "",
      status: "requested",
      requestedById: user.id,
    },
  });
  touch();
}

// Request an invoice directly from a board item (any editor / department).
export async function requestInvoiceForItem(
  boardId: string,
  itemId: string,
  account: string
) {
  const user = await requireEditor();
  const item = await db.item.findUnique({
    where: { id: itemId },
    include: { cells: { include: { column: true } }, board: true },
  });
  if (!item) return;
  const emailCell = item.cells.find((c) => c.column.type === "email");
  const amountCell = item.cells.find((c) => c.column.type === "number");
  const amountCents = amountCell?.value
    ? Math.round(Number(amountCell.value.replace(/[^0-9.]/g, "")) * 100)
    : 0;
  await db.invoice.create({
    data: {
      orgId: user.orgId,
      account: account || "pty",
      candidateName: item.name,
      candidateEmail: emailCell?.value ?? "",
      amountCents,
      description: `Request from ${item.board.name}`,
      department: item.board.name,
      status: "requested",
      requestedById: user.id,
    },
  });
  revalidatePath("/finance");
  revalidatePath(`/boards/${boardId}`);
}

// ── Approve (Accounts / admin) ────────────────────────────────
export async function approveInvoice(id: string) {
  const admin = await requireAdmin();
  await db.invoice.update({
    where: { id },
    data: { status: "approved", approvedById: admin.id },
  });
  touch();
}

export async function rejectInvoice(id: string) {
  await requireAdmin();
  await db.invoice.update({ where: { id }, data: { status: "rejected" } });
  touch();
}

// ── Generate Stripe invoice (Accounts) → auto-email candidate ─
export async function generateInvoice(id: string) {
  await requireAdmin();
  const inv = await db.invoice.findUnique({ where: { id } });
  if (!inv) return;

  const created = await createStripeInvoice({
    account: inv.account as StripeAccount,
    candidateEmail: inv.candidateEmail,
    candidateName: inv.candidateName,
    amountCents: inv.amountCents,
    currency: inv.currency,
    description: inv.description,
  });

  await db.invoice.update({
    where: { id },
    data: {
      status: "invoiced",
      paymentMethod: "stripe",
      stripeInvoiceId: created.id,
      stripeUrl: created.url,
    },
  });

  // Auto-email the candidate the hosted invoice link (no-op until SMTP set).
  if (inv.candidateEmail) {
    await sendMail({
      to: inv.candidateEmail,
      subject: `Your Osphine invoice — ${formatMoney(inv.amountCents, inv.currency)}`,
      html: `<p>Hi ${inv.candidateName},</p>
        <p>Your invoice for <b>${formatMoney(inv.amountCents, inv.currency)}</b>${
          inv.description ? ` (${inv.description})` : ""
        } is ready.</p>
        <p><a href="${created.url}">View & pay your invoice →</a></p>
        <p>Thank you,<br/>Osphine Accounts</p>`,
    });
  }
  touch();
}

// ── Payment ───────────────────────────────────────────────────
export async function markPaid(id: string) {
  await requireAdmin();
  await db.invoice.update({ where: { id }, data: { status: "paid" } });
  touch();
}

// Offline (Serop / bank transfer) — captured manually (Part 17).
export async function markPaidOffline(id: string) {
  await requireAdmin();
  await db.invoice.update({
    where: { id },
    data: { status: "paid", paymentMethod: "offline" },
  });
  touch();
}

export async function deleteInvoice(id: string) {
  await requireAdmin();
  await db.invoice.delete({ where: { id } });
  touch();
}
