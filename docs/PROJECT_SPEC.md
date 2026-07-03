# Oswin Work OS — monday.com Clone (Requirements Spec)

> Source: walkthrough videos (Parts 0–17) of the current monday.com setup used by
> Oswin / Osphine (visa & migration recruitment + education). This document is the
> canonical feature list to replicate. Business domain: candidate pipeline from lead
> → contact → qualification → job offer → visa → placement, with a Finance/Accounts
> layer that every department connects to.

---

## Core domain concepts (monday.com vocabulary → ours)

- **Environment / Workspace** — top-level container per entity (e.g. Osphine PTY, Osphine Institute).
- **Board** — a table representing one department's process (Sales, Visa, Finance, HR…).
- **Group** — a stage within a board's process (New Leads, Contacting, Sign Contract, Done…). Colored.
- **Item** — a row = a candidate/record. The "Item" (name) column is mandatory & cannot be removed.
- **Column** — a typed field. Types we need (see below).
- **Update / "Bubble"** — per-item activity thread with @mention of people or departments → notifications.
- **Automation** — user-built "when X → do Y" rules. Users create these themselves, no dev needed.
- **View** — saved filtered/hidden-column presentation of a board (pinnable).
- **Dashboard** — cross-board charts/KPIs, refreshed ~every 1 min.

---

## Part 0 — Admin Panel (access control)
- **User Roles** with granular permissions (Admin = everything; Member = scoped boards/views/items; Viewer = read-only demo/training; Developer = full build access). Roles are **add/edit/remove**-able and customizable per role which boards/views/items they can touch.
- **Departments** (e.g. Sales has ~15 people) — used as @mention targets in automations & updates.
- **User Status**: Active / Inactive / Unavailable. Deactivating an account **loses their footprint/history** — so instead of deactivating impactful users, downgrade them to **Viewer** (viewers are free, don't count against paid seats) to preserve candidate-interaction history.
- **Invitations**: invite by email even outside the company domain; assign role (viewer/admin/member) on invite; invitee accepts → joins workspace.
- **Auth**: Google sign-in with company email.

## Part 1 — Creating Environments
- Simple button-driven creation of new environments/workspaces (multi-entity: Osphine, Osphine Institute).

## Part 2 — Creating a New Board
- "New board" → name it → create (manual creation; AI-assisted optional). User-friendly.

## Part 3 — Board functions: Groups, Columns, Status, Automations
- **Groups**: add/rename/reorder, **color-coded** (green=Done, orange=accounting/invoice, yellow=contacting, blue=new leads).
- **Pre-built column: Item** (name, renameable e.g. "Name of Candidate", not removable).
- **Update/Bubble column**: activity thread + @mention person/department → notification.
- **Person column**: assign a team member (searchable only among environment members). Used heavily with automation.
- **Status column**: labels; two modes — (a) plain notepad label, (b) automation trigger.
- **Automation builder**: "When status changes to X → move item to group Y" etc. Templates + manual + saveable custom. 3rd-party actions: DocuSign, DocuGen, WhatsApp, Gmail, Google Calendar. NOTE monday lacks folders/filtering for automations — **we should add automation organization/search**.

## Part 10 — Connecting boards without duplicates
- Candidate fills a **form** → data must connect to an **existing** item on another board, **not create a duplicate**.
- Match key = **email** (unique), because names collide.
- Pattern: separate connection board + automation "when item created in board A, connect to board B where email matches email". **Mirror columns** pull connected data (e.g. signature) across boards.
- Requested improvement: **hyperlink/button columns** in emails (monday only allows plain URLs).
- Requested improvement: native **de-duplication on form submit** (monday can't do this).

## Part 11 — Document generation (DocuGen-like)
- Generate documents from board/column data using **uploaded templates** (300+ employers, each with own template/terms).
- **Placeholders** in a Word template map to column codes → filled from item data (name, program, email, signature, date…).
- Manual or automation-triggered generation.
- Output as **PDF or Word**, saved into a **File column** ("output").
- Delivery options (auto-send to candidate etc.) — we usually **review before sending** (uncheck auto-send).
- Signatures & other fields come via **mirror columns** from connected boards.

## Part 12 — Filter / clean views
- Hide columns, build simplified/filtered **views**, **pin** the default view.
- Main table can't be modified; extra views can. Filter (e.g. program = 400) → save → duplicate per variant.

## Part 13 — Dashboards & reports
- Per-board widgets (charts/KPIs) — e.g. X-axis = program (407/400), filter by person/team.
- **Cross-board dashboards** connecting multiple departments (Finance + Sales + Data) for monthly reports.
- Choose which columns/statuses to include; filter by month, program, person.
- **Drill-down**: click a number to verify the underlying items (catch mistriggered/forgotten status).
- Only count items in "Done" (status-accurate). Auto-refresh ~1 min.

## Part 14 — Automated follow-ups & notifications
- Date-based reminders (e.g. visa expiry): notify at **1 month / 3wk / 2wk / 1wk / 5d / 3d / 2d / 1d before**, customizable.
- Trigger "when date arrives / N days before date, at a set time (timezone-aware, AU time)".
- Notify a team/department and/or send email. Condition scoping (e.g. only if group = Signed Up).

## Part 15 — Tagging candidates to employers
- Track per-employer: how many candidates active / in interview / placed.
- Currently a manual connection-board hack. **We want an easy native way to tag a candidate → employer** and see status counts. Open for a better solution.

## Part 16 — Summary of must-haves
- Friendly **admin dashboard**; environment creation without dev help; **editable permissions**.
- Flexible **board/automation creation** by the team themselves (process changes must not require dev).
- Flexible **columns** (all editable, esp. **connections**).
- 3rd parties: **DocuGen, DocuSign**. **Stripe** for payments.
- **All boards visible** in the environment; **Accounting linked to every department** (every stage has a payment verified by Accounts via Stripe).

## Part 17 — Accounts / Finance (BUILD THIS FIRST)
- ~5 accounts boards. Security + validation because of Stripe & Servipag/offline payments.
- **Invoice request intake**: other departments submit requests (form/auto) → land in one intake stage → Accounts **verifies** → auto-generate **Stripe invoice** → auto-email candidate (amount, territory, email pre-filled).
- **Offline payments (Serop/bank transfer)** aren't captured automatically — need a solution to record these.
- **Data board**: authoritative paid/generated invoice data for monthly reports (must not be mistaken).
- **Global Stripe** (Dubai / Osphine Global) vs **Osphine PTY** (offshore) — two Stripe accounts, same intake→verify→generate flow.
- Invoice/Stripe templates: obtain from Accounts team.
- **Sequencing rule**: build Finance/Accounts board first — every other department (HR, Vishome, etc.) depends on it for invoice requests.

---

## Explicit improvements requested over monday.com
1. Hyperlink/button columns usable inside automated emails.
2. Native de-duplication on form submission (match by email, update instead of insert).
3. Organization/folders/search for automations.
4. Easy native candidate→employer tagging with live status counts.

## Key integrations
- **Google OAuth** (company-email sign-in)
- **Stripe** (two accounts: PTY offshore + Global/Dubai)
- **DocuGen** (doc generation from templates + placeholders)
- **DocuSign** (signatures)
- **Gmail / email**, **WhatsApp**, **Google Calendar** (automation actions)
