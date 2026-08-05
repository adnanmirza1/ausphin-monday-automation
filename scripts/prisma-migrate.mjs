// Resilient `prisma migrate deploy` for build time.
// Neon (serverless, pooled) can (a) be asleep at build start → P1001, or
// (b) refuse the migration advisory lock through the PgBouncer pooler → P1002.
// Both are infrastructure/transient issues, not bad migrations. We retry (which
// wakes it / lets the lock clear); a genuine migration SQL error still fails the
// build, but a persistent infra failure only warns — production is already
// migrated, so a transient DB nap or pooler lock must not block deploys.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

// Prisma migrations need a DIRECT (non-pooled) connection — advisory locks don't
// work through Neon's PgBouncer pooler (P1002). Use DIRECT_URL if provided,
// otherwise derive it from DATABASE_URL by dropping the "-pooler" host segment.
// The app runtime keeps using the pooled DATABASE_URL.
// On Vercel, DATABASE_URL is in the process env; locally it's in .env (which
// this plain node script doesn't auto-load), so read it from .env as a fallback.
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl && fs.existsSync(".env")) {
  const m = fs.readFileSync(".env", "utf8").match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\n]+)/m);
  if (m) dbUrl = m[1];
}
const migrateUrl = process.env.DIRECT_URL || (dbUrl || "").replace("-pooler", "");
// Only override the child's DATABASE_URL when we actually resolved a URL;
// otherwise let Prisma load it itself (via its config/.env). Also disable the
// migration advisory lock — Neon's pooler times it out (P1002); safe here since
// the build is a single migrator, not concurrent.
const childEnv = {
  ...process.env,
  ...(migrateUrl ? { DATABASE_URL: migrateUrl } : {}),
  PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1",
};

const MAX = 4;
for (let attempt = 1; attempt <= MAX; attempt++) {
  const res = spawnSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", env: childEnv });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  process.stdout.write(out);
  if (res.status === 0) process.exit(0);

  // Treat connection AND advisory-lock/timeout errors as retryable infra issues.
  const isInfra = /P1001|P1002|Can't reach database|advisory lock|timed out|timeout|ECONNREFUSED|ETIMEDOUT/i.test(out);
  if (!isInfra) {
    console.error("[migrate] migration failed (not an infra/connection error) — failing build.");
    process.exit(res.status ?? 1);
  }
  if (attempt < MAX) {
    const wait = attempt * 3000;
    console.warn(`[migrate] database unreachable / lock busy (attempt ${attempt}/${MAX}); retrying in ${wait / 1000}s…`);
    const until = Date.now() + wait;
    while (Date.now() < until) { /* busy-wait (build context, no async) */ }
  }
}
console.warn("[migrate] database still unreachable after retries — skipping (prod is already migrated). Continuing build.");
process.exit(0);
