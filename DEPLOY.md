# Deploy — Vercel + Postgres (Neon)

The app uses **PostgreSQL** via Prisma. Follow these steps to go live.

## 1. Create a Postgres database (Neon — free)

1. Go to https://neon.tech → create a project.
2. Copy the **connection string** (looks like
   `postgresql://user:pass@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require`).

## 2. Create the tables + seed (run once, locally)

In the project folder, point `.env` at Neon and run:

```bash
# .env  ->  DATABASE_URL="postgresql://...neon.tech/db?sslmode=require"
npx prisma migrate deploy      # creates all tables
npm run db:seed                # demo org + admin + sample boards  (optional)
```

> `db:seed` creates the demo admin `adnan.mustafa@toptal.com / password`.
> For real production, create your own admin and skip/replace the seed.

## 3. Push to GitHub

Already connected to `origin`:

```bash
git push origin main
```

## 4. Deploy on Vercel

1. https://vercel.com → **Add New → Project** → import
   `adnanmirza1/ausphin-monday-automation`.
2. **Environment Variables** (Settings → Environment Variables):

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | your Neon connection string |
   | `CRON_SECRET` | any long random string |

   Optional (enable later in **Settings → Integrations** inside the app):
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `STRIPE_SECRET_KEY_PTY`,
   `STRIPE_SECRET_KEY_GLOBAL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   `SMTP_FROM`, `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_SECRET`.

3. **Deploy.** Build command is `prisma generate && next build` (already set).
4. Open the deployed URL and sign in.

## 5. (Optional) Daily reminders cron

Add `vercel.json` to run reminders daily:

```json
{
  "crons": [{ "path": "/api/cron/reminders", "schedule": "0 9 * * *" }]
}
```

Vercel Cron sends the request; the endpoint requires
`Authorization: Bearer $CRON_SECRET` — set that in Vercel Cron settings or a
proxy. (For manual runs, the in-app **Reminders → Run now** button also works.)

## Notes

- After schema changes: `npx prisma migrate dev` locally, commit the new
  migration, and `npx prisma migrate deploy` (or let it run) against production.
- Connection pooling: Neon's pooled connection string is recommended for
  serverless.
