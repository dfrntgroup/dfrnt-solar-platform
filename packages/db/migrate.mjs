// Applies migrations/*.sql in name order, once each, inside a transaction per file.
// Runs during the Vercel build using the database URL Vercel holds; skipped when no URL is set (local builds).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) { console.log("[migrate] no database URL; skipped"); process.exit(0); }
// Only production builds change the database. A preview build could hold the live URL; it must never migrate it.
if (process.env.VERCEL && process.env.VERCEL_ENV !== "production" && process.env.MIGRATE_PREVIEW !== "1") {
  console.log(`[migrate] ${process.env.VERCEL_ENV} build; skipped (set MIGRATE_PREVIEW=1 for a preview database)`); process.exit(0);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const sql = postgres(url, { ssl: process.env.DB_SSL === "disable" ? false : "require", max: 1, onnotice: () => {} });
try {
  await sql`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`select pg_advisory_lock(727001)`;
  const done = new Set((await sql`select name from public._migrations`).map((r) => r.name));
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    const body = readFileSync(join(dir, f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public._migrations (name) values (${f})`;
    });
    console.log(`[migrate] applied ${f}`);
  }
  console.log(`[migrate] up to date (${done.size} previously applied)`);
} finally {
  await sql`select pg_advisory_unlock(727001)`.catch(() => {});
  await sql.end();
}
