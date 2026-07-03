# ausphin-monday-automation

**Oswin / Osphine Work OS** — a monday.com-style Work Operating System tailored to a
visa/migration recruitment business. Boards, workflows, documents, finance and
reporting for every department in one app.

## Stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript** · **Tailwind CSS v4**
- **Prisma 7** ORM. SQLite for local dev (portable to Postgres for production) via the
  `@prisma/adapter-better-sqlite3` driver adapter.
- Custom cookie-session auth (bcrypt). Google OAuth is integration-ready.

## Features

- **Admin**: custom roles + granular per-board permissions, departments, user status, email invitations (with accept/join link)
- **Environments → Boards → Groups → Items** with 11 column types (text, status, person, date, number, email, phone, **signature**, **connection**, **mirror**, file)
- **Views**: Table · Kanban · Calendar · saved & pinned filtered views · drag-and-drop reordering (items, groups, columns)
- **Automations**: visual "when → then" builder (move, set status, notify, round-robin, generate document, request invoice), folders + search, edit
- **Forms**: public intake forms with de-dup by email + cross-board connection; signature pad
- **Documents (DocuGen)**: templates with placeholders → real **PDF** (pdf-lib) + real **.docx** (OOXML), signatures embedded
- **Finance**: invoice intake → verify → Stripe invoice → email; PTY + Global accounts; offline capture
- **Reminders**: date-based (e.g. visa expiry) with a cron endpoint
- **Dashboard**: cross-board KPIs & charts with month/person/program filters
- **Employers**: candidate → employer tagging with live stage counts
- Fully **responsive** (mobile drawer sidebar)

## Getting started

```bash
npm install
# set DATABASE_URL in .env (e.g. file:./dev.db)
npx prisma migrate dev
npm run db:seed        # demo org, users, sample boards
npm run dev
```

Demo login: `adnan.mustafa@toptal.com` / `password`

## Environment variables

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | e.g. `file:./dev.db` (dev) or a Postgres URL (prod) |
| `CRON_SECRET` | Bearer token for `GET /api/cron/reminders` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `STRIPE_SECRET_KEY_PTY` / `STRIPE_SECRET_KEY_GLOBAL` | Stripe invoicing |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Outbound email |
| `DOCUSIGN_INTEGRATION_KEY` / `DOCUSIGN_ACCOUNT_ID` / `DOCUSIGN_SECRET` / `DOCUSIGN_BASE_URL` | E-signature |

Integration status is visible in-app at **Settings → Integrations** (admin).

## Scripts

- `npm run dev` — dev server
- `npm run build` / `npm start` — production build & serve
- `npm run db:seed` / `npm run db:reset` / `npm run db:studio`
