// Resilient `prisma migrate deploy` for build time.
// Neon (serverless) can be asleep when a build starts → first connect returns
// P1001. We retry (which wakes it) and apply any pending migrations. A genuine
// migration error fails the build; a persistent *connection* failure only warns
// (production is already migrated, so a transient DB nap must not block deploys).
import { spawnSync } from "node:child_process";

const MAX = 4;
for (let attempt = 1; attempt <= MAX; attempt++) {
  const res = spawnSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8" });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  process.stdout.write(out);
  if (res.status === 0) process.exit(0);

  const isConnection = /P1001|Can't reach database|ECONNREFUSED|ETIMEDOUT/i.test(out);
  if (!isConnection) {
    console.error("[migrate] migration failed (not a connection error) — failing build.");
    process.exit(res.status ?? 1);
  }
  if (attempt < MAX) {
    const wait = attempt * 3000;
    console.warn(`[migrate] database unreachable (attempt ${attempt}/${MAX}); retrying in ${wait / 1000}s…`);
    const until = Date.now() + wait;
    while (Date.now() < until) { /* busy-wait (build context, no async) */ }
  }
}
console.warn("[migrate] database still unreachable after retries — skipping (prod is already migrated). Continuing build.");
process.exit(0);
