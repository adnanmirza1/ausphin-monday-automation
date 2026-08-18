import "server-only";
import { db } from "@/lib/db";
import { generateDocumentCoreDetailed } from "@/lib/generate-doc";
import { sendMail, mailerConfigured } from "@/lib/mailer";
import { urlDisplay, parseFileValue } from "@/lib/cell-values";
import { normalizeEmail, findMatchingParent, createSubitem, getEmailColumn } from "@/lib/subitems";

// Events emitted by board mutations.
export type AutomationEvent =
  | { type: "item_created"; boardId: string; itemId: string }
  | { type: "status_changes"; boardId: string; itemId: string; columnId: string; value: string | null }
  | { type: "column_changes"; boardId: string; itemId: string; columnId: string; value: string | null }
  | { type: "person_assigned"; boardId: string; itemId: string; columnId: string; personId: string | null }
  | { type: "item_moved"; boardId: string; itemId: string; groupId: string };

type Trigger =
  | { type: "item_created" }
  | { type: "status_changes"; columnId: string; to: string } // to = labelId | "any"
  | { type: "column_changes"; columnId: string; when?: "any" | "not_empty" }
  | { type: "person_assigned"; columnId: string }
  | { type: "item_moved"; groupId: string } // groupId | "any"
  // Generic third-party-integration trigger: fires from a provider's webhook
  // receiver (src/app/api/integrations/[provider]/webhook/route.ts), not
  // from an in-app board mutation, so it is matched separately (see
  // runIntegrationAutomations below) rather than through the synchronous
  // AutomationEvent path. providerTriggerId is one of that provider's
  // ProviderTrigger.id values from the registry (e.g. github's
  // "issue_created"). resource = the provider resource id (repo/project) |
  // "any".
  | { type: "integration_trigger"; provider: string; providerTriggerId: string; resource: string };

// Source column -> destination column, used by the two "create item/subitem
// on another board" actions (Automations 1 & 3) for flexible field transfer.
// Both ids are validated server-side at execution time — a stale mapping
// (deleted column) is simply skipped, never trusted blindly.
export type FieldMapping = { sourceColumnId: string; destColumnId: string };

type Action =
  | { type: "move_to_group"; groupId: string }
  | { type: "set_status"; columnId: string; to: string }
  | { type: "notify"; target: "person" | "department"; targetId?: string; message: string }
  | { type: "assign_round_robin"; columnId: string; departmentId: string }
  | { type: "generate_document"; templateId: string }
  | { type: "request_invoice"; account: string; amountColumnId?: string }
  | { type: "send_email"; toColumnId?: string; subject: string; body: string }
  // Automation 1: "create item on another board" — fieldMapping lets the user
  // choose which source columns feed which destination columns. When absent
  // (legacy rules saved before this feature), falls back to the original
  // behavior: copy the item name + the first email column.
  | { type: "create_item_in_board"; boardId: string; connect?: boolean; fieldMapping?: FieldMapping[] }
  | { type: "set_date"; columnId: string; mode: "specific" | "today" | "offset"; date?: string; offsetDays?: number }
  | { type: "change_column_value"; columnId: string; value: string }
  | {
      type: "send_docusign";
      fileColumnId?: string;
      recipientEmailColumnId?: string;
      recipientNameColumnId?: string;
      docusignTemplateId?: string;
      subject?: string;
      message?: string;
      statusColumnId?: string;
      signedColumnId?: string;
    }
  // Automation 2: "when a status changes, create a subitem under the item on
  // THIS board whose email column matches this item's email." emailColumnId
  // is the column to read the triggering item's email from (defaults to the
  // board's first email column when omitted).
  | { type: "create_subitem_by_email"; emailColumnId?: string }
  // Automation 3: "when an item is created, find the matching item (by
  // email) on ANOTHER board and add this item as a subitem there," with the
  // same flexible field mapping as create_item_in_board.
  | {
      type: "create_subitem_in_board";
      boardId: string;
      emailColumnId?: string; // source-board column to read the email from
      fieldMapping?: FieldMapping[];
    }
  // Generic third-party-integration action: executes providerActionId (one
  // of that provider's ProviderAction.id values from the registry, e.g.
  // github's "create_issue", slack's "post_message") against the org's
  // stored connection for `provider`. `fields` map to that action's declared
  // ProviderAction.fields keys and support the same {{Placeholder}} syntax
  // as send_email, rendered from the triggering item's data before sending.
  | { type: "integration_action"; provider: string; providerActionId: string; resource?: string; fields: Record<string, string> };

// A stored action is either a single action or a sequence (multiple THEN steps).
// Kept backward-compatible: existing single-action rules parse straight to Action.
type StoredAction = Action | { type: "multi"; actions: Action[] };

// Normalize a parsed stored action into a flat list of actions to run in order.
function actionList(a: StoredAction | null): Action[] {
  if (!a) return [];
  if (a.type === "multi") return Array.isArray(a.actions) ? a.actions : [];
  return [a];
}

function parse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function matches(trigger: Trigger, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false;
  if (trigger.type === "status_changes" && event.type === "status_changes") {
    if (trigger.columnId !== event.columnId) return false;
    return trigger.to === "any" || trigger.to === event.value;
  }
  if (trigger.type === "column_changes" && event.type === "column_changes") {
    if (trigger.columnId !== event.columnId) return false;
    return trigger.when === "not_empty" ? !!event.value : true;
  }
  if (trigger.type === "person_assigned" && event.type === "person_assigned") {
    return trigger.columnId === event.columnId && !!event.personId;
  }
  if (trigger.type === "item_moved" && event.type === "item_moved") {
    return trigger.groupId === "any" || trigger.groupId === event.groupId;
  }
  // integration_trigger can never reach here: trigger.type !== event.type
  // above already excludes it, since AutomationEvent has no such variant —
  // it's matched separately in runIntegrationAutomations from each
  // provider's webhook route.
  return trigger.type === "item_created";
}

// Render {{Placeholders}} in email templates from an item's data.
async function renderTemplate(itemId: string, text: string): Promise<string> {
  const item = await db.item.findUnique({
    where: { id: itemId },
    include: { cells: { include: { column: true, person: true } } },
  });
  if (!item) return text;
  const map: Record<string, string> = { item: item.name, name: item.name };
  for (const c of item.cells) {
    let v = c.value ?? "";
    if (c.column.type === "status") {
      try {
        v = (JSON.parse(c.column.config).labels ?? []).find((l: { id: string }) => l.id === c.value)?.label ?? "";
      } catch {}
    } else if (c.column.type === "person") v = c.person?.name ?? "";
    else if (c.column.type === "url") v = urlDisplay(c.value);
    else if (c.column.type === "file") v = parseFileValue(c.value).map((f) => f.name).join(", ");
    map[c.column.name.toLowerCase()] = v;
  }
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => map[String(k).toLowerCase()] ?? "");
}

// Meaningful success/error logging for automations that create records
// elsewhere (Automations 1-3), posted to the triggering item's timeline —
// same place users already look for automation activity (see send_email /
// send_docusign's `note`/`status` entries above).
async function logAutomation(itemId: string, message: string) {
  await db.update.create({ data: { itemId, body: message, mentions: "[]" } }).catch(() => {});
}

type SrcCell = {
  columnId: string;
  value: string | null;
  personId: string | null;
  column: { type: string; config: string };
  person: { id: string; name: string } | null;
};
type DestColumn = { id: string; type: string; config: string };

// Resolve one source cell to a display string, mirroring renderTemplate's
// per-type formatting (status label text, person name, url display, file
// names) so mapped values read the same as everywhere else in the app.
function displayValue(cell: SrcCell | undefined): string {
  if (!cell) return "";
  if (cell.column.type === "status") {
    try {
      const labels: { id: string; label: string }[] = JSON.parse(cell.column.config).labels ?? [];
      return labels.find((l) => l.id === cell.value)?.label ?? "";
    } catch {
      return "";
    }
  }
  if (cell.column.type === "person") return cell.person?.name ?? "";
  if (cell.column.type === "url") return urlDisplay(cell.value);
  if (cell.column.type === "file") return parseFileValue(cell.value).map((f) => f.name).join(", ");
  return cell.value ?? "";
}

// Apply a source->destination field mapping (Automations 1 & 3) onto a
// freshly-created item. Handles missing/null source values safely (skipped,
// never writes empty cells) and adapts the value to the destination
// column's type:
//  - status -> status: match by label text (case-insensitive), else skip
//    (never invents a label that doesn't exist on the destination column).
//  - person -> person: copy the personId directly when the destination is
//    also a person column (same org, so the id is meaningful there).
//  - anything -> text/longtext/email/phone/url: write the resolved display
//    text.
async function applyFieldMapping(
  srcCells: SrcCell[],
  destColumns: DestColumn[],
  mapping: FieldMapping[],
  destItemId: string
) {
  for (const m of mapping) {
    const srcCell = srcCells.find((c) => c.columnId === m.sourceColumnId);
    const destCol = destColumns.find((c) => c.id === m.destColumnId);
    if (!destCol) continue;

    if (destCol.type === "status") {
      const text = displayValue(srcCell);
      if (!text) continue;
      let labels: { id: string; label: string }[] = [];
      try {
        labels = JSON.parse(destCol.config).labels ?? [];
      } catch {}
      const match = labels.find((l) => l.label.trim().toLowerCase() === text.trim().toLowerCase());
      if (!match) continue; // never invent a label the column doesn't have
      await db.cell.upsert({
        where: { itemId_columnId: { itemId: destItemId, columnId: destCol.id } },
        create: { itemId: destItemId, columnId: destCol.id, value: match.id },
        update: { value: match.id },
      });
      continue;
    }

    if (destCol.type === "person") {
      if (srcCell?.column.type !== "person" || !srcCell.personId) continue;
      await db.cell.upsert({
        where: { itemId_columnId: { itemId: destItemId, columnId: destCol.id } },
        create: { itemId: destItemId, columnId: destCol.id, value: srcCell.personId, personId: srcCell.personId },
        update: { value: srcCell.personId, personId: srcCell.personId },
      });
      continue;
    }

    const text = displayValue(srcCell);
    if (!text) continue; // missing/null values handled safely — nothing written
    await db.cell.upsert({
      where: { itemId_columnId: { itemId: destItemId, columnId: destCol.id } },
      create: { itemId: destItemId, columnId: destCol.id, value: text },
      update: { value: text },
    });
  }
}

// Runs a single non-recursive pass of automations for the board & event.
// Every automation that matches gets exactly one AutomationLog row per run
// (Requirement: execution history), so "did my automation run, and did it
// work" is answerable without digging through item-timeline notes.
export async function runAutomations(event: AutomationEvent) {
  const automations = await db.automation.findMany({
    where: { boardId: event.boardId, enabled: true },
  });

  for (const a of automations) {
    const trigger = parse<Trigger>(a.trigger);
    const stored = parse<StoredAction>(a.action);
    if (!trigger || !stored) continue;
    if (!matches(trigger, event)) continue;

    const startedAt = new Date();
    let status: "success" | "partial" | "failed" = "success";
    let error = "";
    let attempts = 1;

    // Run every THEN step in order (supports multiple actions per rule).
    // A thrown/unexpected error in one step doesn't abort the remaining
    // steps — each is independently attempted and its outcome folded into
    // the run's overall status, same principle as the engine's existing
    // per-action "skip and continue" behavior.
    for (const action of actionList(stored)) {
      try {
        const outcome = await execute(action, event);
        attempts += outcome.attempts - 1;
        if (outcome.status === "failed" && status !== "failed") {
          status = "failed";
          error = outcome.error ?? error;
        } else if (outcome.status === "skipped" && status === "success") {
          status = "partial";
          error = outcome.error ?? error;
        }
      } catch (e) {
        status = "failed";
        error = e instanceof Error ? e.message : String(e);
      }
    }

    await db.automationLog
      .create({
        data: {
          automationId: a.id,
          automationName: a.name,
          boardId: a.boardId,
          itemId: event.itemId,
          status,
          error,
          attempts,
          startedAt,
          finishedAt: new Date(),
        },
      })
      .catch((e) => console.error("[automation:log]", e));
  }
}

// Per-action outcome, used only to roll up a run's overall status/error in
// runAutomations — actions themselves still post their own human-readable
// notes to the item timeline via logAutomation/db.update.create as before.
type ActionOutcome = { status: "success" | "skipped" | "failed"; error?: string; attempts: number };

// Retry wrapper for the two actions that call an external service and can
// fail transiently (network blip, provider hiccup): send_email, send_docusign.
// NOT used for pure-DB actions, where retrying risks duplicating a side
// effect (e.g. re-running move_to_group is harmless, but resending an email
// is not idempotent — retrying the SEND, not the whole action, is what's
// safe here). Both underlying calls (sendMail, DocuSign send) never throw —
// they resolve to { ok, error } — so this inspects `.ok` to decide whether
// to retry, rather than relying on a thrown exception. Two attempts total,
// a short delay between them; the second failure is what gets reported.
async function withRetryResult<T extends { ok: boolean; error?: string }>(
  fn: () => Promise<T>,
  maxAttempts = 2
): Promise<{ result: T; attempts: number }> {
  let last: T;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await fn();
    if (last.ok || attempt === maxAttempts) return { result: last, attempts: attempt };
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  // Unreachable (loop always returns on the final attempt), but keeps TS
  // happy about a guaranteed return.
  return { result: last!, attempts: maxAttempts };
}

async function execute(action: Action, event: AutomationEvent): Promise<ActionOutcome> {
  const itemId = event.itemId;
  // Set by any branch that hits a "nothing to do" / validation skip (the
  // same points that already post a "skipped — ..." note); everything else
  // defaults to success unless the branch throws, which the caller in
  // runAutomations catches and records as "failed".
  const outcome: ActionOutcome = { status: "success", attempts: 1 };

  switch (action.type) {
    case "move_to_group": {
      const count = await db.item.count({ where: { groupId: action.groupId } });
      await db.item.update({
        where: { id: itemId },
        data: { groupId: action.groupId, position: count },
      });
      break;
    }

    case "set_status": {
      await db.cell.upsert({
        where: { itemId_columnId: { itemId, columnId: action.columnId } },
        create: { itemId, columnId: action.columnId, value: action.to },
        update: { value: action.to },
      });
      break;
    }

    case "set_date": {
      // Only allow writing to an actual Date column (A2).
      const col = await db.column.findFirst({
        where: { id: action.columnId, type: "date" },
        select: { id: true },
      });
      if (!col) { outcome.status = "skipped"; outcome.error = "target column is not a date column"; break; }
      let dateStr = "";
      const today = new Date();
      const iso = (d: Date) =>
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
          d.getUTCDate()
        ).padStart(2, "0")}`;
      if (action.mode === "today") {
        dateStr = iso(today);
      } else if (action.mode === "offset") {
        const d = new Date(
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
        );
        d.setUTCDate(d.getUTCDate() + (action.offsetDays ?? 0));
        dateStr = iso(d);
      } else {
        dateStr = action.date ?? "";
      }
      if (!dateStr) { outcome.status = "skipped"; outcome.error = "no date resolved"; break; }
      // Upsert only (no cascade) — mirrors set_status, avoids trigger loops.
      await db.cell.upsert({
        where: { itemId_columnId: { itemId, columnId: action.columnId } },
        create: { itemId, columnId: action.columnId, value: dateStr },
        update: { value: dateStr },
      });
      break;
    }

    case "change_column_value": {
      // Update any column to a specific value (Improvement A6). For person
      // columns the value is treated as a userId so assignments stay valid.
      const col = await db.column.findUnique({
        where: { id: action.columnId },
        select: { type: true },
      });
      if (!col) { outcome.status = "skipped"; outcome.error = "target column not found"; break; }
      const isPerson = col.type === "person";
      await db.cell.upsert({
        where: { itemId_columnId: { itemId, columnId: action.columnId } },
        create: {
          itemId,
          columnId: action.columnId,
          value: action.value || null,
          ...(isPerson ? { personId: action.value || null } : {}),
        },
        update: {
          value: action.value || null,
          ...(isPerson ? { personId: action.value || null } : {}),
        },
      });
      break;
    }

    case "notify": {
      await db.update.create({
        data: {
          itemId,
          body: action.message || "Automation notification",
          mentions: JSON.stringify(action.targetId ? [action.targetId] : []),
        },
      });
      break;
    }

    case "assign_round_robin": {
      const people = await db.user.findMany({
        where: { departmentId: action.departmentId, status: { not: "inactive" } },
        select: { id: true },
      });
      if (people.length === 0) { outcome.status = "skipped"; outcome.error = "no active people in the department"; break; }
      // pick the person with the fewest current assignments in this column
      const counts = await Promise.all(
        people.map(async (p) => ({
          id: p.id,
          n: await db.cell.count({
            where: { columnId: action.columnId, personId: p.id },
          }),
        }))
      );
      counts.sort((a, b) => a.n - b.n);
      const chosen = counts[0].id;
      await db.cell.upsert({
        where: { itemId_columnId: { itemId, columnId: action.columnId } },
        create: { itemId, columnId: action.columnId, personId: chosen, value: chosen },
        update: { personId: chosen, value: chosen },
      });
      break;
    }

    case "generate_document": {
      const result = await generateDocumentCoreDetailed(itemId, action.templateId);
      if (!result.ok) {
        await logAutomation(itemId, `⚡ Generate document: skipped — ${result.error}`);
        outcome.status = "skipped";
        outcome.error = result.error;
      }
      break;
    }

    case "request_invoice": {
      const it = await db.item.findUnique({
        where: { id: itemId },
        include: { cells: { include: { column: true } }, board: { include: { environment: true } } },
      });
      if (!it) { outcome.status = "skipped"; outcome.error = "item not found"; break; }
      const emailCell = it.cells.find((c) => c.column.type === "email");
      const amountCell = action.amountColumnId
        ? it.cells.find((c) => c.columnId === action.amountColumnId)
        : undefined;
      const amountCents = amountCell?.value
        ? Math.round(Number(amountCell.value.replace(/[^0-9.]/g, "")) * 100)
        : 0;
      await db.invoice.create({
        data: {
          orgId: it.board.environment.orgId,
          account: action.account || "pty",
          candidateName: it.name,
          candidateEmail: emailCell?.value ?? "",
          amountCents,
          description: `Auto-request from ${it.board.name}`,
          department: it.board.name,
          status: "requested",
        },
      });
      break;
    }

    case "send_email": {
      const it = await db.item.findUnique({
        where: { id: itemId },
        include: {
          cells: { include: { column: true } },
          board: { include: { environment: true } },
        },
      });
      if (!it) { outcome.status = "skipped"; outcome.error = "item not found"; break; }
      // Recipient = chosen email column, else the first email column on the item.
      const toCell = action.toColumnId
        ? it.cells.find((c) => c.columnId === action.toColumnId)
        : it.cells.find((c) => c.column.type === "email");
      const to = (toCell?.value ?? "").trim();
      const subject = await renderTemplate(itemId, action.subject || "");
      const body = await renderTemplate(itemId, action.body || "");
      const from = process.env.SMTP_FROM || process.env.SMTP_USER || "";
      const configured = mailerConfigured();
      let delivered = false;
      let sendError: string | undefined;
      if (to) {
        // Retried — a transient SMTP/network blip shouldn't need a human to
        // notice and manually resend; a real rejection (bad address, auth
        // failure) fails the same way on both attempts and is reported once.
        // sendMail() never throws (it returns {ok:false, error} on failure),
        // so withRetryResult inspects .ok itself rather than relying on a
        // thrown exception to know when to retry.
        const { result: res, attempts } = await withRetryResult(() =>
          sendMail({
            from,
            to,
            subject: subject || "(no subject)",
            html: `<p>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`,
            text: body,
          })
        );
        outcome.attempts = attempts;
        delivered = res.ok === true;
        sendError = res.error;
      }
      // Honest status so a silent non-delivery is visible in the history.
      const status = !to ? "skipped" : delivered ? "sent" : configured ? "failed" : "logged";
      if (status === "skipped" || status === "failed") {
        outcome.status = status;
        outcome.error = !to ? "no recipient email found" : sendError;
      }
      // Record what happened on the item's timeline.
      await db.update.create({
        data: {
          itemId,
          body:
            `✉ Automated email${to ? ` → ${to}` : " (no recipient found)"} [${status}]` +
            `${sendError ? ` — ${sendError}` : ""}: ${subject}\n\n${body}`,
          mentions: "[]",
        },
      });
      // Record on the item's email conversation history (Missing #2).
      if (to) {
        await db.emailMessage.create({
          data: {
            orgId: it.board.environment.orgId,
            itemId,
            direction: "outbound",
            status,
            fromEmail: from,
            toEmail: to,
            subject,
            body,
          },
        });
      }
      break;
    }

    case "send_docusign": {
      const it = await db.item.findUnique({
        where: { id: itemId },
        include: { cells: { include: { column: true } }, board: { include: { environment: true } } },
      });
      if (!it) { outcome.status = "skipped"; outcome.error = "item not found"; break; }
      const orgId = it.board.environment.orgId;
      const { sendEnvelopeFromDocument, sendEnvelopeFromTemplate, getDsAccount } = await import("@/lib/docusign");
      const account = await getDsAccount(orgId);
      const note = async (msg: string) =>
        db.update.create({ data: { itemId, body: `✒ DocuSign: ${msg}`, mentions: "[]" } });
      if (!account) {
        await note("skipped — DocuSign not connected.");
        outcome.status = "skipped";
        outcome.error = "DocuSign not connected";
        break;
      }
      // Recipient
      const emailCell = action.recipientEmailColumnId
        ? it.cells.find((c) => c.columnId === action.recipientEmailColumnId)
        : it.cells.find((c) => c.column.type === "email");
      const recipientEmail = (emailCell?.value ?? "").trim();
      const nameCell = action.recipientNameColumnId
        ? it.cells.find((c) => c.columnId === action.recipientNameColumnId)
        : undefined;
      const recipientName = (nameCell?.value ?? it.name).trim();
      if (!recipientEmail) {
        await note("skipped — no recipient email.");
        outcome.status = "skipped";
        outcome.error = "no recipient email";
        break;
      }
      const subject = await renderTemplate(itemId, action.subject || `Please sign: ${it.name}`);
      const message = await renderTemplate(itemId, action.message || "");

      let res: { ok: boolean; envelopeId?: string; error?: string };
      // Retried — a transient DocuSign API blip shouldn't require a human
      // to notice and manually resend.
      if (action.docusignTemplateId) {
        const { result, attempts } = await withRetryResult(() =>
          sendEnvelopeFromTemplate(orgId, {
            templateId: action.docusignTemplateId!,
            recipients: [{ email: recipientEmail, name: recipientName }],
            subject,
            message,
          })
        );
        res = result;
        outcome.attempts = attempts;
      } else {
        // Send a document from a file column (latest file).
        const fileCell = action.fileColumnId
          ? it.cells.find((c) => c.columnId === action.fileColumnId)
          : it.cells.find((c) => c.column.type === "file");
        const files = parseFileValue(fileCell?.value);
        const file = files[files.length - 1];
        if (!file?.url) {
          await note("skipped — no document found in the file column.");
          outcome.status = "skipped";
          outcome.error = "no document in file column";
          break;
        }
        const { fetchFileBuffer } = await import("@/lib/blob-storage");
        let base64: string;
        try {
          base64 = (await fetchFileBuffer(file.url)).toString("base64");
        } catch {
          await note("skipped — could not read the document file.");
          outcome.status = "skipped";
          outcome.error = "could not read document file";
          break;
        }
        const ext = /\.pdf$/i.test(file.name) ? "pdf" : "docx";
        const { result, attempts } = await withRetryResult(() =>
          sendEnvelopeFromDocument(orgId, {
            documentBase64: base64,
            documentName: file.name,
            fileExtension: ext,
            recipients: [{ email: recipientEmail, name: recipientName }],
            subject,
            message,
          })
        );
        res = result;
        outcome.attempts = attempts;
      }
      if (!res.ok) {
        await note(`failed — ${res.error ?? "unknown error"}`);
        outcome.status = "failed";
        outcome.error = res.error ?? "unknown error";
        break;
      }
      await db.docuSignEnvelope.create({
        data: {
          orgId,
          itemId,
          boardId: event.boardId,
          envelopeId: res.envelopeId ?? "",
          status: "sent",
          recipientEmail,
          recipientName,
          subject,
          statusColumnId: action.statusColumnId ?? null,
          signedColumnId: action.signedColumnId ?? null,
        },
      });
      if (action.statusColumnId) {
        const { syncEnvelope } = await import("@/lib/docusign-sync");
        // Write the initial "sent" status immediately (best-effort).
        const created = await db.docuSignEnvelope.findFirst({
          where: { itemId, envelopeId: res.envelopeId ?? "" },
          orderBy: { createdAt: "desc" },
        });
        if (created) await syncEnvelope(created.id).catch(() => {});
      }
      await note(`sent to ${recipientEmail}.`);
      break;
    }

    case "create_item_in_board": {
      const src = await db.item.findUnique({
        where: { id: itemId },
        include: { cells: { include: { column: true, person: true } }, board: { include: { columns: true } } },
      });
      if (!src) { outcome.status = "skipped"; outcome.error = "item not found"; break; }
      // Validate the destination board exists and belongs to the same org as
      // the source board — never trust a stored boardId blindly (it was
      // chosen by a user with access at save time, but boards can be
      // archived/deleted since, and a stale id must not silently write
      // cross-org data).
      const destBoard = await db.board.findUnique({
        where: { id: action.boardId },
        include: { columns: true, environment: true },
      });
      const srcOrg = await db.board.findUnique({
        where: { id: src.boardId },
        select: { environment: { select: { orgId: true } } },
      });
      if (!destBoard || destBoard.archivedAt || destBoard.environment.orgId !== srcOrg?.environment.orgId) {
        await logAutomation(itemId, `⚡ Create item in board: skipped — destination board unavailable.`);
        outcome.status = "skipped";
        outcome.error = "destination board unavailable";
        break;
      }
      const targetGroup = await db.group.findFirst({
        where: { boardId: action.boardId },
        orderBy: { position: "asc" },
      });
      if (!targetGroup) {
        await logAutomation(itemId, `⚡ Create item in board: skipped — "${destBoard.name}" has no group to receive it.`);
        outcome.status = "skipped";
        outcome.error = `"${destBoard.name}" has no group to receive it`;
        break;
      }
      const count = await db.item.count({ where: { groupId: targetGroup.id } });
      // Field mapping (Automation 1): explicit source->destination column
      // pairs chosen by the user. Falls back to the legacy behavior (copy
      // name + first email column) when no mapping is configured, so
      // existing automations saved before this feature keep working exactly
      // as before.
      const mapping = (action.fieldMapping ?? []).filter(
        (m) => src.board.columns.some((c) => c.id === m.sourceColumnId) &&
          destBoard.columns.some((c) => c.id === m.destColumnId)
      );
      const newItem = await db.item.create({
        data: { boardId: action.boardId, groupId: targetGroup.id, name: src.name, position: count },
      });
      if (mapping.length > 0) {
        await applyFieldMapping(src.cells, destBoard.columns, mapping, newItem.id);
      } else {
        // Legacy fallback: copy the email value across so the two records
        // can still be matched/mirrored.
        const srcEmail = src.cells.find((c) => c.column.type === "email");
        if (srcEmail?.value) {
          const targetEmailCol = destBoard.columns.find((c) => c.type === "email");
          if (targetEmailCol)
            await db.cell.create({
              data: { itemId: newItem.id, columnId: targetEmailCol.id, value: srcEmail.value },
            });
        }
      }
      await logAutomation(itemId, `⚡ Created item "${src.name}" on "${destBoard.name}".`);
      // Optionally link the source item to the new one via a connection column
      // on the source board that targets action.boardId (enables mirrors).
      if (action.connect) {
        const connCol = src.board.columns.find((c) => {
          if (c.type !== "connection") return false;
          try {
            return JSON.parse(c.config).targetBoardId === action.boardId;
          } catch {
            return false;
          }
        });
        if (connCol)
          await db.cell.upsert({
            where: { itemId_columnId: { itemId, columnId: connCol.id } },
            create: { itemId, columnId: connCol.id, value: newItem.id },
            update: { value: newItem.id },
          });
      }
      await runAutomations({ type: "item_created", boardId: action.boardId, itemId: newItem.id });
      break;
    }

    // Automation 2: status changes -> create a subitem under the matching
    // item (by email) on THIS board.
    case "create_subitem_by_email": {
      const boardId = event.boardId;
      const emailColumn = action.emailColumnId
        ? await db.column.findFirst({ where: { id: action.emailColumnId, boardId } })
        : await getEmailColumn(boardId);
      if (!emailColumn) {
        await logAutomation(itemId, `⚡ Create subitem: skipped — no email column configured on this board.`);
        outcome.status = "skipped";
        outcome.error = "no email column configured on this board";
        break;
      }
      const triggering = await db.item.findUnique({
        where: { id: itemId },
        select: { id: true, name: true, parentId: true, cells: { where: { columnId: emailColumn.id }, select: { value: true } } },
      });
      if (!triggering) { outcome.status = "skipped"; outcome.error = "item not found"; break; }
      const email = normalizeEmail(triggering.cells[0]?.value);
      if (!email) {
        await logAutomation(itemId, `⚡ Create subitem: skipped — this item has no email in "${emailColumn.name}".`);
        outcome.status = "skipped";
        outcome.error = `no email in "${emailColumn.name}"`;
        break;
      }
      const parent = await findMatchingParent(boardId, emailColumn.id, email);
      if (!parent) {
        await logAutomation(itemId, `⚡ Create subitem: skipped — no existing item matches "${email}".`);
        outcome.status = "skipped";
        outcome.error = `no existing item matches "${email}"`;
        break;
      }
      // The triggering item IS the record to (re)nest — if it's already the
      // matching parent itself, or already a subitem of it, there's nothing
      // to do (prevents a self-referential or duplicate subitem). Otherwise
      // the triggering item itself is reparented under the match — it must
      // NOT be duplicated as a fresh copy, or the board would end up with
      // both the original item AND a new subitem carrying the same data.
      if (parent.id === itemId || triggering.parentId === parent.id) { outcome.status = "skipped"; outcome.error = "already nested under this parent"; break; }
      await db.item.update({
        where: { id: itemId },
        data: { parentId: parent.id, groupId: parent.groupId },
      });
      await db.update.create({
        data: { itemId, body: `⚡ Moved under "${parent.name}" as a subitem — email matched.`, mentions: "[]" },
      });
      await logAutomation(parent.id, `⚡ "${triggering.name}" added as a subitem (email match).`);
      break;
    }

    // Automation 3: item created (with an email) -> find the matching item
    // by email on ANOTHER board, and create this record as a subitem there.
    case "create_subitem_in_board": {
      const src = await db.item.findUnique({
        where: { id: itemId },
        include: { cells: { include: { column: true, person: true } }, board: { include: { columns: true } } },
      });
      if (!src) { outcome.status = "skipped"; outcome.error = "item not found"; break; }

      const destBoard = await db.board.findUnique({
        where: { id: action.boardId },
        include: { columns: true, environment: true },
      });
      const srcOrg = await db.board.findUnique({
        where: { id: src.boardId },
        select: { environment: { select: { orgId: true } } },
      });
      if (!destBoard || destBoard.archivedAt || destBoard.environment.orgId !== srcOrg?.environment.orgId) {
        await logAutomation(itemId, `⚡ Create subitem on another board: skipped — destination board unavailable.`);
        outcome.status = "skipped";
        outcome.error = "destination board unavailable";
        break;
      }

      const srcEmailCol = action.emailColumnId
        ? src.board.columns.find((c) => c.id === action.emailColumnId)
        : src.board.columns.find((c) => c.type === "email");
      const srcEmail = srcEmailCol ? src.cells.find((c) => c.columnId === srcEmailCol.id) : undefined;
      const email = normalizeEmail(srcEmail?.value);
      if (!email) {
        await logAutomation(itemId, `⚡ Create subitem on another board: skipped — no email to match on.`);
        outcome.status = "skipped";
        outcome.error = "no email to match on";
        break;
      }

      const destEmailCol = destBoard.columns.find((c) => c.type === "email");
      if (!destEmailCol) {
        await logAutomation(itemId, `⚡ Create subitem on another board: skipped — "${destBoard.name}" has no email column.`);
        outcome.status = "skipped";
        outcome.error = `"${destBoard.name}" has no email column`;
        break;
      }
      const parent = await findMatchingParent(destBoard.id, destEmailCol.id, email);
      if (!parent) {
        await logAutomation(itemId, `⚡ Create subitem on another board: skipped — no item on "${destBoard.name}" matches "${email}".`);
        outcome.status = "skipped";
        outcome.error = `no item on "${destBoard.name}" matches "${email}"`;
        break;
      }

      // Duplicate-execution guard: if this automation already ran for this
      // source item (e.g. the event fired twice), don't create a second
      // subitem under the same parent for the same source record.
      const alreadyCreated = await db.item.findFirst({
        where: { parentId: parent.id, name: src.name },
        select: { id: true },
      });
      if (alreadyCreated) {
        await logAutomation(itemId, `⚡ Create subitem on another board: skipped — already added under "${parent.name}".`);
        outcome.status = "skipped";
        outcome.error = `already added under "${parent.name}"`;
        break;
      }

      const mapping = (action.fieldMapping ?? []).filter(
        (m) => src.board.columns.some((c) => c.id === m.sourceColumnId) &&
          destBoard.columns.some((c) => c.id === m.destColumnId)
      );
      const sub = await createSubitem(destBoard.id, parent.id, parent.groupId, src.name);
      if (mapping.length > 0) {
        await applyFieldMapping(src.cells, destBoard.columns, mapping, sub.id);
      } else if (destEmailCol) {
        // No explicit mapping: at least keep the matched email on the subitem.
        await db.cell.upsert({
          where: { itemId_columnId: { itemId: sub.id, columnId: destEmailCol.id } },
          create: { itemId: sub.id, columnId: destEmailCol.id, value: srcEmail?.value ?? null },
          update: { value: srcEmail?.value ?? null },
        });
      }
      await db.update.create({
        data: { itemId: sub.id, body: `⚡ Added as a subitem from "${src.board.name}" — email match.`, mentions: "[]" },
      });
      await logAutomation(itemId, `⚡ Added as a subitem of "${parent.name}" on "${destBoard.name}" (email match).`);
      break;
    }

    case "integration_action": {
      const it = await db.item.findUnique({
        where: { id: itemId },
        include: { cells: { include: { column: true, person: true } }, board: { include: { environment: true } } },
      });
      if (!it) { outcome.status = "skipped"; outcome.error = "item not found"; break; }
      const orgId = it.board.environment.orgId;
      const { getProvider } = await import("@/lib/integrations/registry");
      const provider = getProvider(action.provider);
      if (!provider) { outcome.status = "skipped"; outcome.error = `unknown provider "${action.provider}"`; break; }
      const conn = await db.connectedIntegration.findUnique({
        where: { orgId_provider: { orgId, provider: action.provider } },
      });
      if (!conn) {
        await logAutomation(itemId, `⚡ ${provider.name}: skipped — not connected.`);
        outcome.status = "skipped";
        outcome.error = `${provider.name} not connected`;
        break;
      }
      const renderedFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(action.fields ?? {})) renderedFields[k] = await renderTemplate(itemId, v);
      const { result: res, attempts } = await withRetryResult(() =>
        provider.executeAction(conn.accessToken, action.providerActionId, action.resource, renderedFields, conn.accountLabel)
      );
      outcome.attempts = attempts;
      if (!res.ok) {
        await logAutomation(itemId, `⚡ ${provider.name}: failed — ${res.error}`);
        outcome.status = "failed";
        outcome.error = res.error;
        break;
      }
      await logAutomation(itemId, `⚡ ${provider.name}: done${res.url ? ` — ${res.url}` : ""}.`);
      break;
    }
  }

  return outcome;
}

// Integration webhook path: unlike board-mutation events, an incoming
// provider webhook isn't scoped to one boardId, so automations are looked up
// by provider+trigger across every board in the org that owns the
// connection, and executed against a synthetic event carrying no itemId
// (only actions that don't need a pre-existing item make sense here — see
// executeFromIntegrationTrigger).
export async function runIntegrationAutomations(
  orgId: string,
  provider: string,
  providerTriggerId: string,
  resource: string,
  triggerLabel: string,
  triggerUrl: string
) {
  const boards = await db.board.findMany({
    where: { environment: { orgId } },
    select: { id: true },
  });
  const boardIds = boards.map((b) => b.id);
  if (boardIds.length === 0) return;

  const automations = await db.automation.findMany({
    where: { boardId: { in: boardIds }, enabled: true },
  });

  for (const a of automations) {
    const trigger = parse<Trigger>(a.trigger);
    const stored = parse<StoredAction>(a.action);
    if (!trigger || !stored) continue;
    if (trigger.type !== "integration_trigger") continue;
    if (trigger.provider !== provider || trigger.providerTriggerId !== providerTriggerId) continue;
    if (trigger.resource !== "any" && trigger.resource !== resource) continue;

    const startedAt = new Date();
    let status: "success" | "partial" | "failed" = "success";
    let error = "";
    let attempts = 1;

    for (const action of actionList(stored)) {
      try {
        const outcome = await executeFromIntegrationTrigger(action, triggerLabel, triggerUrl, provider, resource);
        attempts += outcome.attempts - 1;
        if (outcome.status === "failed" && status !== "failed") {
          status = "failed";
          error = outcome.error ?? error;
        } else if (outcome.status === "skipped" && status === "success") {
          status = "partial";
          error = outcome.error ?? error;
        }
      } catch (e) {
        status = "failed";
        error = e instanceof Error ? e.message : String(e);
      }
    }

    await db.automationLog
      .create({
        data: {
          automationId: a.id,
          automationName: a.name,
          boardId: a.boardId,
          itemId: null,
          status,
          error,
          attempts,
          startedAt,
          finishedAt: new Date(),
        },
      })
      .catch((e) => console.error("[automation:log]", e));
  }
}

// Actions reachable from an integration_trigger. Only "create item on this
// board" makes sense without a pre-existing itemId — other actions (set_status,
// send_email, etc.) all require one and are skipped here rather than silently
// no-op'd, so a misconfigured rule is visible in the log.
async function executeFromIntegrationTrigger(
  action: Action,
  triggerLabel: string,
  triggerUrl: string,
  provider: string,
  resource: string
): Promise<ActionOutcome> {
  if (action.type === "create_item_in_board") {
    const destBoard = await db.board.findUnique({ where: { id: action.boardId } });
    if (!destBoard || destBoard.archivedAt) return { status: "skipped", error: "destination board unavailable", attempts: 1 };
    const targetGroup = await db.group.findFirst({ where: { boardId: action.boardId }, orderBy: { position: "asc" } });
    if (!targetGroup) return { status: "skipped", error: `"${destBoard.name}" has no group to receive it`, attempts: 1 };
    const count = await db.item.count({ where: { groupId: targetGroup.id } });
    const newItem = await db.item.create({
      data: { boardId: action.boardId, groupId: targetGroup.id, name: triggerLabel, position: count },
    });
    await db.update.create({
      data: { itemId: newItem.id, body: `⚡ Created from ${provider} (${resource}): ${triggerUrl}`, mentions: "[]" },
    });
    await runAutomations({ type: "item_created", boardId: action.boardId, itemId: newItem.id });
    return { status: "success", attempts: 1 };
  }
  return { status: "skipped", error: `action "${action.type}" requires an existing item and can't run from an integration trigger`, attempts: 1 };
}
